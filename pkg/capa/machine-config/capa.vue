<script setup lang="ts">
import {
  computed, onMounted, ref, toRefs, watch, WritableComputedRef
} from 'vue';
import { useStore } from 'vuex';
import Loading from '@shell/components/Loading';
import { Banner } from '@components/Banner';
import { HTTP_TOKENS_VALUES, UBUNTU_LTS_AMI_NAME_PATTERNS } from './constants';
import { allHash } from '@shell/utils/promise';
import { stringify, exceptionToErrorsArray, formatAWSError } from '@shell/utils/error';
import { _CREATE } from '@shell/config/query-params';
import InstanceConfigSection from './InstanceConfigSection.vue';
import StorageSection from './StorageSection.vue';
import AdvancedSection from './AdvancedSection.vue';
import merge from 'lodash/merge';

defineOptions({ name: 'MachineConfigCapa' });

const defaultConfig = {
  spec: {
    template: {
      spec: {
        cloudInit:               { insecureSkipSecretsManager: true },
        iamInstanceProfile:      '',
        instanceMetadataOptions: { httpTokens: HTTP_TOKENS_VALUES.REQUIRED },
        instanceType:            't3.medium',
        marketType:              'OnDemand',
        publicIp:                false,
        rootVolume:              {
          encrypted: false, size: 32, type: 'gp3'
        },
        sshKeyName:     '',
        privateDnsName: { hostnameType: 'resource-name' }
      }
    }
  }
};

const emit = defineEmits(['validationChanged', 'update:isIpv6', 'update:isDualStack', 'update:value']);

interface Props {
  value: Record<string, any>;
  uuid: string;
  infrastructureCluster?: Record<string, any>;
  cluster?: Record<string, any>;
  credentialId: string;
  isIpv6?: boolean;
  isDualStack?: boolean;
  machinePools?: any[];
  poolCreateMode?: boolean;
  mode?: string;
}

const props = withDefaults(defineProps<Props>(), {
  infrastructureCluster: () => ({}),
  cluster:               () => ({}),
  isIpv6:                false,
  isDualStack:           false,
  machinePools:          () => [],
  poolCreateMode:        true,
  mode:                  _CREATE,
});

const {
  value,
  credentialId,
  infrastructureCluster,
  mode,
} = toRefs(props);

const store = useStore();

const errors = ref<any[]>([]);
const loading = ref(true);
const ec2Client = ref<any>(null);
const iamClient = ref<any>(null);
const instanceTypes = ref<any>(null);
const instanceProfiles = ref<any>(null);
const loadedRegionalFor = ref<string | null>(null);
const subnets = ref<any>(null);
const securityGroups = ref<any>(null);
const keyPairs = ref<any>(null);

const spec: WritableComputedRef<Record<string, any>> = computed({
  get() {
    value.value.spec = value.value.spec || {};
    value.value.spec.template = value.value.spec.template || {};
    value.value.spec.template.spec = value.value.spec.template.spec || {};

    return value.value.spec.template.spec;
  },
  set(neu: Record<string, any>) {
    value.value.spec = value.value.spec || {};
    value.value.spec.template = value.value.spec.template || {};
    value.value.spec.template.spec = neu;
  },
});

const region = computed(() => infrastructureCluster.value?.spec?.region || null);

// Subnet ids explicitly defined on the infrastructure cluster. Empty when the
// cluster relies on cluster-managed (auto-discovered) subnets.
const clusterSubnetIds = computed(() => {
  return (infrastructureCluster.value?.spec?.network?.subnets || [])
    .map((subnet: { id?: string }) => subnet.id)
    .filter((id: string | undefined): id is string => !!id);
});

// Look up the most recent Canonical Ubuntu LTS AMI available in the current region
async function fetchLatestUbuntuAmi(): Promise<string | null> {
  for ( const namePattern of UBUNTU_LTS_AMI_NAME_PATTERNS ) {
    const images: Array<{ ImageId?: string; CreationDate?: string }> = await store.dispatch('aws/depaginateList', {
      client: ec2Client.value,
      cmd:    'describeImages',
      key:    'Images',
      opt:    {
        Filters: [
          { Name: 'name', Values: [namePattern] },
          { Name: 'architecture', Values: ['x86_64'] },
          { Name: 'root-device-type', Values: ['ebs'] },
          { Name: 'virtualization-type', Values: ['hvm'] },
          { Name: 'state', Values: ['available'] },
        ],
      },
    });

    const latest = (images || [])
      .filter((image) => !!image.ImageId && !!image.CreationDate)
      .sort((a, b) => (b.CreationDate as string).localeCompare(a.CreationDate as string))[0];

    if ( latest?.ImageId ) {
      return latest.ImageId;
    }
  }

  return null;
}

async function fetchData() {
  errors.value = [];
  if ( !credentialId.value || !region.value ) {
    loading.value = false;

    return;
  }

  loading.value = true;
  try {
    ec2Client.value = await store.dispatch('aws/ec2', {
      region:            region.value,
      cloudCredentialId: credentialId.value
    });
    iamClient.value = await store.dispatch('aws/iam', {
      region:            region.value,
      cloudCredentialId: credentialId.value
    });

    if ( !instanceTypes.value ) {
      instanceTypes.value = await store.dispatch('aws/describeInstanceTypes', { client: ec2Client.value });
    }

    const hash: Record<string, any> = {};

    if ( loadedRegionalFor.value !== region.value ) {
      hash.subnets = await ec2Client.value.describeSubnets({});
      hash.instanceProfiles = await iamClient.value.listInstanceProfiles({});
      hash.securityGroups = await ec2Client.value.describeSecurityGroups({});
      hash.keyPairs = await ec2Client.value.describeKeyPairs({});
    }

    const res = await allHash(hash);

    const refMap: Record<string, typeof subnets> = {
      subnets,
      instanceProfiles,
      securityGroups,
      keyPairs,
    };

    for ( const k in res ) {
      if ( refMap[k] ) {
        refMap[k].value = res[k];
      }
    }

    if ( !value.value.instanceType ) {
      value.value['instanceType'] = store.getters['aws/defaultInstanceType'];
    }

    loadedRegionalFor.value = region.value;
    const valueWithDefaults = merge({}, defaultConfig, value.value);

    Object.assign(value.value, valueWithDefaults || {});

    spec.value.ami = spec.value.ami || {};
    if ( mode.value === _CREATE && !spec.value.ami.id ) {
      const amiId = await fetchLatestUbuntuAmi();

      if ( amiId ) {
        spec.value.ami = { ...spec.value.ami, id: amiId };
      }
    }
  } catch (e) {
    errors.value = exceptionToErrorsArray(formatAWSError(e));
  } finally {
    loading.value = false;
  }
}

if (!value.value.instanceMetadataOptions?.httpTokens) {
  value.value.instanceMetadataOptions = {
    ...value.value.instanceMetadataOptions,
    httpTokens: HTTP_TOKENS_VALUES.REQUIRED,
  };
}

if (!Array.isArray(value.value.additionalVolumes)) {
  value.value.additionalVolumes = [];
}

watch(credentialId, () => {
  fetchData();
});

watch(region, (newRegion, oldRegion) => {
  if (newRegion === oldRegion) {
    return;
  }
  fetchData();
});

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div>
    <div v-if="errors.length">
      <div
        v-for="(err, idx) in errors"
        :key="idx"
      >
        <Banner
          color="error"
          :label="stringify(err)"
        />
      </div>
    </div>
    <Loading v-if="loading || !loadedRegionalFor" />
    <template v-else>
      <InstanceConfigSection
        v-model:value="spec"
        :instance-types="instanceTypes"
        :subnets="subnets"
        :instance-profiles="instanceProfiles"
        :key-pairs="keyPairs"
        :cluster-subnet-ids="clusterSubnetIds"
        :mode="mode"
        @validationChanged="$emit('validationChanged', $event)"
      />
      <StorageSection
        v-model:value="spec"
        :mode="mode"
      />
      <AdvancedSection
        v-model:value="spec"
        :security-groups="securityGroups"
        :mode="mode"
      />
    </template>
  </div>
</template>
