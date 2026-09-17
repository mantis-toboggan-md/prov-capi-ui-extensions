import { importTypes } from '@rancher/auto-import';
import { IExtension, ModelExtensionConstructor, EditableRelatedResourcesLocation } from '@shell/core/types';
import { CAPAProvisioner } from './provisioner';
import { CAPARKE2Cluster } from './model-extension/provisioning.cattle.io.cluster';
import { CAPI } from '@shell/config/types';

// Temporary test target for the addEditableRelatedResources extension point
const TEST_SECRET_TYPE = 'secret';
const TEST_SECRET_ID = 'default/nancy-test';

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

  // Show the machine configs referenced by an RKE2 cluster's machine pools alongside the
  // cluster itself, so they can all be edited as YAML on the one page.
  plugin.addEditableRelatedResources(
    EditableRelatedResourcesLocation.RESOURCE_YAML,
    { resource: [CAPI.RANCHER_CLUSTER] },
    {
      editableRelatedResources: (cluster: any, relatedResources: any[]) => {
        // The hook is called from a computed property, so it has to be synchronous. Look in the
        // store for the secret and, if it isn't there yet, kick off a load without waiting for it -
        // the computed property will re-run once the store is updated.
        const secret = cluster.$getters['byId'](TEST_SECRET_TYPE, TEST_SECRET_ID);

        if (!secret) {
          cluster.$dispatch('find', { type: TEST_SECRET_TYPE, id: TEST_SECRET_ID })
            .catch((e: any) => console.warn(`Couldn't load ${ TEST_SECRET_ID }`, e)); // eslint-disable-line no-console

          return relatedResources;
        }

        return [...relatedResources, secret];
      }
    }
  );
}
