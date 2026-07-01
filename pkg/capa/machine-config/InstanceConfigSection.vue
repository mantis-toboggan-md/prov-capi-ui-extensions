<script setup lang="ts">
import { computed, watch } from 'vue';
import { useStore } from 'vuex';
import { useI18n } from '@shell/composables/useI18n';
import { RcSection } from '@components/RcSection';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { LabeledInput } from '@components/Form/LabeledInput';
import { Checkbox } from '@components/Form/Checkbox';
import { Banner } from '@components/Banner';
import { getSubnetDisplayName } from '@shell/utils/aws';
import { HTTP_TOKENS_VALUES } from './constants';
import { _CREATE } from '@shell/config/query-params';

const SUBNET_NONE = '__none__';

defineOptions({ name: 'InstanceConfigSection' });

const emit = defineEmits(['validationChanged']);

interface Props {
  value: Record<string, any>;
  instanceTypes?: Record<string, any>[];
  subnets?: Record<string, any>[];
  instanceProfiles?: Record<string, any>[];
  keyPairs?: Record<string, any>[];
  vpcId?: string;
  // Subnet ids explicitly defined on the infrastructure cluster. Empty when the
  // cluster relies on cluster-managed (auto-discovered) subnets.
  clusterSubnetIds?: string[];
  mode?: string;
  loadingSshKeys?: boolean;
  loadingInstanceProfiles?: boolean;
  loadingSubnets?: boolean;
  loadingSecurityGroups?: boolean;
  loadingInstanceTypes?: boolean;
  isAmiAutoPopulated?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  instanceTypes:    () => [],
  subnets:          () => [],
  instanceProfiles: () => [],
  keyPairs:         () => [],
  vpcId:            '',
  clusterSubnetIds: () => [],
  mode:             _CREATE,
  loadingSshKeys:   false,
  loadingInstanceProfiles: false,
  loadingSubnets:   false,
  loadingSecurityGroups: false,
  loadingInstanceTypes: false,
  isAmiAutoPopulated: false,
});

const store = useStore();
const { t } = useI18n(store);
const httpTokensOptions = computed(() => [
  { label: t('capa.machineConfig.instanceConfiguration.advanced.instanceMetadataOptions.httpTokens.options.required'), value: HTTP_TOKENS_VALUES.REQUIRED },
  { label: t('capa.machineConfig.instanceConfiguration.advanced.instanceMetadataOptions.httpTokens.options.optional'), value: HTTP_TOKENS_VALUES.OPTIONAL },
]);

const instanceTypeOptions = computed(() => {
  let lastGroup;
  const out = [];

  for ( const row of (props.instanceTypes || []) ) {
    if ( row.groupLabel !== lastGroup ) {
      out.push({
        kind:     'group',
        disabled: false,
        label:    row.groupLabel
      });

      lastGroup = row.groupLabel;
    }

    out.push({
      label: row['label'],
      value: row['apiName'],
    });
  }

  return out;
});

const subnetOptions = computed(() => {
  const options = (props.subnets || [])
    .filter((subnet: Record<string, any>) => !!props.vpcId && subnet.VpcId === props.vpcId)
    .map((subnet: Record<string, any>) => ({
      label: getSubnetDisplayName(subnet as any),
      value: subnet['SubnetId'],
    }))
    .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));

  return [
    { label: t('capa.machineConfig.instanceConfiguration.subnet.none'), value: SUBNET_NONE },
    ...options
  ];
});

const selectedSubnetId = computed({
  get() {
    if (!props.vpcId) {
      return SUBNET_NONE;
    }

    return props.value.subnet?.id || SUBNET_NONE;
  },
  set(val: string) {
    if ( !props.value.subnet ) {
      props.value.subnet = {};
    }

    props.value.subnet.id = (!props.vpcId || val === SUBNET_NONE) ? null : val;
  }
});

const instanceProfileOptions = computed(() => {
  return (props.instanceProfiles || [])
    .map((profile: Record<string, any>) => profile.InstanceProfileName)
    .filter((name: string | undefined) => !!name);
});

const sshKeyOptions = computed(() => {
  const noneOption = { label: t('capa.machineConfig.instanceConfiguration.sshKeyName.noneLabel'), value: '' };

  const keys = (props.keyPairs || [])
    .map((keyPair: Record<string, any>) => keyPair.KeyName)
    .filter((name: string | undefined): name is string => !!name)
    .map((name: string) => ({ label: name, value: name }));

  return [noneOption, ...keys];
});

const selectedSubnetNotInCluster = computed(() => {
  const subnetId = props.value.subnet?.id;

  if ( !subnetId ) {
    return false;
  }

  return !(props.clusterSubnetIds || []).includes(subnetId);
});

const subnetPublicIpError = computed(() => {
  return selectedSubnetNotInCluster.value && !!props.value?.publicIp;
});

const subnetBanner = computed(() => {
  if ( !selectedSubnetNotInCluster.value ) {
    return null;
  }

  if ( subnetPublicIpError.value ) {
    return {
      color: 'error',
      label: t('capa.machineConfig.instanceConfiguration.subnet.notInClusterError', { subnet: props.value.subnet?.id })
    };
  }

  return {
    color: 'warning',
    label: t('capa.machineConfig.instanceConfiguration.subnet.notInClusterWarning')
  };
});

const amiDisplayId = computed({
  get() {
    const amiId = props.value.ami?.id || '';

    if (props.isAmiAutoPopulated && amiId) {
      return `${ amiId } (${ t('capa.machineConfig.instanceConfiguration.advanced.machineImage.latestUbuntu') })`;
    }

    return amiId;
  },
  set(val: string) {
    if (!props.value.ami) {
      props.value.ami = {};
    }
    props.value.ami.id = val;
  },
});

watch(subnetPublicIpError, () => {
  emit('validationChanged', !subnetPublicIpError.value);
}, { immediate: true });
</script>

<template>
  <RcSection
    :title="t('capa.machineConfig.instanceConfiguration.title')"
    :expandable="true"
    mode="with-header"
    type="primary"
  >
    <p>{{ t('capa.machineConfig.instanceConfiguration.description') }}</p>

    <LabeledSelect
      v-model:value="value.instanceType"
      :options="instanceTypeOptions"
      label-key="capa.machineConfig.instanceConfiguration.instanceType.label"
      option-key="value"
      option-label="label"
      :mode="mode"
      :loading="loadingInstanceTypes"
    />
    <LabeledSelect
      v-model:value="value.sshKeyName"
      :options="sshKeyOptions"
      :mode="mode"
      label-key="capa.machineConfig.instanceConfiguration.sshKeyName.label"
      :sub-label="t('capa.machineConfig.instanceConfiguration.sshKeyName.description')"
      required
      :loading="loadingSshKeys"
    />
    <LabeledSelect
      v-model:value="selectedSubnetId"
      :options="subnetOptions"
      label-key="capa.machineConfig.instanceConfiguration.subnet.label"
      option-key="value"
      option-label="label"
      :mode="mode"
      :loading="loadingSubnets"
    />
    <Banner
      v-if="subnetBanner"
      :color="subnetBanner.color"
      :label="subnetBanner.label"
    />
    <Checkbox
      v-model:value="value.publicIp"
      :mode="mode"
      label-key="capa.machineConfig.instanceConfiguration.publicIp.label"
      :tooltip="t('capa.machineConfig.instanceConfiguration.publicIp.tooltip')"
    />

    <RcSection
      :title="t('capa.machineConfig.instanceConfiguration.advanced.title')"
      :expandable="true"
      mode="with-header"
      type="secondary"
      :expanded="false"
    >
      <LabeledInput
        v-model:value="amiDisplayId"
        label-key="capa.machineConfig.instanceConfiguration.advanced.machineImage.label"
        :placeholder="t('capa.machineConfig.instanceConfiguration.advanced.machineImage.placeholder')"
        :mode="mode"
      />
      <LabeledSelect
        v-model:value="value.iamInstanceProfile"
        :options="instanceProfileOptions"
        :taggable="true"
        :mode="mode"
        :loading="loadingInstanceProfiles"
        label-key="capa.machineConfig.instanceConfiguration.advanced.iamInstanceProfileName.label"
      />
      <div>
        <LabeledSelect
          v-model:value="value.instanceMetadataOptions.httpTokens"
          :options="httpTokensOptions"
          label-key="capa.machineConfig.instanceConfiguration.advanced.instanceMetadataOptions.httpTokens.label"
          :mode="mode"
        />
        <p class="text-muted text-small mt-5 mb-0">
          {{ t('capa.machineConfig.instanceConfiguration.advanced.instanceMetadataOptions.httpTokens.description') }}
        </p>
      </div>
    </RcSection>
  </RcSection>
</template>
