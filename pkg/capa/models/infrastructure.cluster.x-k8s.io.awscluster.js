import SteveModel from '@shell/plugins/steve/steve-class';
import { AWS_IDENTITY_GROUP } from '../types/capa';

export default class AWSCluster extends SteveModel {
  /**
   * Resources that should be shown, and can be edited, alongside this AWSCluster
   *
   * That's the identity it references, which holds the credentials CAPA uses to talk to AWS. The
   * identity types are all cluster scoped, so the reference is a bare name
   *
   * @returns {Promise<import('@shell/core/types').EditableRelatedResource[]>}
   */
  async fetchEditableRelatedResources() {
    console.log('**** fetching editable related resources for AWSCluster'); // eslint-disable-line no-console
    const ref = this.spec?.identityRef;

    if (!ref?.kind || !ref?.name) {
      return [];
    }

    const identity = await this.$dispatch('management/find', {
      type: `${ AWS_IDENTITY_GROUP }.${ ref.kind.toLowerCase() }`,
      id:   ref.name,
    }, { root: true }).catch((e) => {
      console.warn(`CAPA: couldn't load identity ${ ref.kind }/${ ref.name }`, e); // eslint-disable-line no-console

      return null;
    });

    return identity ? [{
      resource: identity,
      groupKey: 'capa.resourceGraph.groups.identityReference',
    }] : [];
  }
}
