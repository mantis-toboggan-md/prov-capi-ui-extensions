import { importTypes } from '@rancher/auto-import';
import { IExtension, ModelExtensionConstructor, EditableRelatedResourcesLocation, EditableRelatedResource } from '@shell/core/types';
import { CAPAProvisioner, hasCAPAInfrastructure } from './provisioner';
import { CAPARKE2Cluster } from './model-extension/provisioning.cattle.io.cluster';
import { CAPI } from '@shell/config/types';
import { AWS_CLUSTER_SCHEMA, AWS_MACHINE_TEMPLATE_SCHEMA } from './types/capa';

export const MACHINE_TEMPLATE_GROUP = 'capa.resourceGraph.groups.machineTemplates';
export const INFRASTRUCTURE_CLUSTER_GROUP = 'capa.resourceGraph.groups.infrastructureCluster';

/**
 * Fetch a resource from the management store, logging and swallowing any failure so that one
 * missing resource doesn't stop the rest of the graph from being built
 */
async function findOrNull(cluster: any, type: string, id: string): Promise<any | null> {
  return await cluster.$dispatch('management/find', { type, id }, { root: true })
    .catch((e: any) => {
      console.warn(`CAPA: couldn't load ${ type } ${ id }`, e); // eslint-disable-line no-console

      return null;
    });
}

/**
 * The AWS machine templates referenced by the cluster's machine pools
 *
 * These are the same resources the provisioning cluster model contributes, so they are re-grouped
 * under a CAPA specific heading rather than added a second time
 */
async function fetchMachineTemplates(cluster: any): Promise<EditableRelatedResource[]> {
  const names: string[] = (cluster.spec?.rkeConfig?.machinePools || [])
    .map((pool: any) => pool.machineConfigRef?.name)
    .filter((name?: string) => !!name);

  const templates = await Promise.all(names.map((name) => findOrNull(
    cluster,
    AWS_MACHINE_TEMPLATE_SCHEMA,
    `${ cluster.metadata?.namespace }/${ name }`
  )));

  return templates
    .filter((template) => !!template)
    .map((resource) => ({
      resource,
      groupKey: MACHINE_TEMPLATE_GROUP,
    }));
}

/**
 * The AWSCluster the provisioning cluster's `infrastructureRef` points at
 *
 * Its own model contributes the identity it references, so the shell expands the tree from here
 */
async function fetchInfrastructureCluster(cluster: any): Promise<EditableRelatedResource[]> {
  const ref = cluster.spec?.rkeConfig?.infrastructureRef;

  if (!ref?.name) {
    return [];
  }

  const namespace = ref.namespace || cluster.metadata?.namespace;
  const infrastructureCluster = await findOrNull(cluster, AWS_CLUSTER_SCHEMA, `${ namespace }/${ ref.name }`);

  return infrastructureCluster ? [{
    resource: infrastructureCluster,
    groupKey: INFRASTRUCTURE_CLUSTER_GROUP,
  }] : [];
}

// Init the package
export default function(plugin: IExtension): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register custom provisioner object
  plugin.register('provisioner', CAPAProvisioner.ID, CAPAProvisioner);

  // Built-in icon
  plugin.metadata.icon = require('./assets/amazoncapa.svg');
  // Register machine config component
  plugin.register('machine-config', CAPAProvisioner.ID, () => import('./machine-config/capa.vue'));

  // Register a model extension for the provisioning model
  plugin.addModelExtension('provisioning.cattle.io.cluster', CAPARKE2Cluster as ModelExtensionConstructor);

  // Show the AWS resources behind a CAPA cluster alongside the cluster itself, so they can all be
  // edited as YAML on the one page: the machine templates its machine pools reference and the
  // AWSCluster its infrastructureRef points at
  plugin.addEditableRelatedResources(
    EditableRelatedResourcesLocation.RESOURCE_YAML,
    { resource: [CAPI.RANCHER_CLUSTER] },
    {
      fetchExtensionEditableRelatedResources: async(cluster: any, relatedResources: EditableRelatedResource[]) => {
        // This extension point is registered for every provisioning cluster, so only contribute
        // to the ones this extension actually provisions
        console.log('*** evaluating cluster ', cluster?.id, hasCAPAInfrastructure(cluster));
        if (!hasCAPAInfrastructure(cluster)) {
          console.log('*** skipping non-capa cluster ', cluster?.id);

          return relatedResources;
        }

        const [machineTemplates, infrastructureCluster] = await Promise.all([
          fetchMachineTemplates(cluster),
          fetchInfrastructureCluster(cluster),
        ]);

        const ours = [...machineTemplates, ...infrastructureCluster];
        const ourIds = new Set(ours.map((entry) => entry.resource?.id).filter(Boolean));

        // Drop anything already contributed for the same resource (the cluster model adds the
        // machine templates under its own generic group) so ours, with the CAPA groups, wins
        const existing = relatedResources.filter((entry) => !ourIds.has(entry.resource?.id));

        return [...existing, ...ours];
      }
    }
  );
}
