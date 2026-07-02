<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { useI18n } from '@shell/composables/useI18n';
import { RcSection } from '@components/RcSection';
import { Checkbox } from '@components/Form/Checkbox';
import { RadioGroup } from '@components/Form/Radio';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import KeyValue from '@shell/components/form/KeyValue';
import UnitInput from '@shell/components/form/UnitInput';
import { MACHINE_CONFIG_DEFAULTS, SECURITY_GROUP_OPTIONS } from './constants';
import { _CREATE } from '@shell/config/query-params';

defineOptions({ name: 'AdvancedSection' });

interface Props {
  cloudInitInsecureSkipSecretsManager?: boolean;
  additionalSecurityGroups?: Array<{ id: string }>;
  marketType?: string;
  spotMarketMaxPrice?: string;
  additionalTags?: Record<string, string>;
  mode?: string;
  securityGroups?: Record<string, any>[];
  vpcId?: string;
  loadingSecurityGroups?: boolean;
}

const emit = defineEmits([
  'update:cloudInitInsecureSkipSecretsManager',
  'update:additionalSecurityGroups',
  'update:marketType',
  'update:spotMarketMaxPrice',
  'update:additionalTags',
]);

const props = withDefaults(defineProps<Props>(), {
  cloudInitInsecureSkipSecretsManager: MACHINE_CONFIG_DEFAULTS.cloudInit.insecureSkipSecretsManager,
  additionalSecurityGroups: () => [],
  marketType:             MACHINE_CONFIG_DEFAULTS.marketType,
  spotMarketMaxPrice:     '',
  additionalTags:         () => ({}),
  mode:                  _CREATE,
  securityGroups:        () => [],
  vpcId:                 '',
  loadingSecurityGroups: false,
});

const store = useStore();
const { t } = useI18n(store);

const modelCloudInitInsecureSkipSecretsManager = computed({
  get: () => props.cloudInitInsecureSkipSecretsManager ?? MACHINE_CONFIG_DEFAULTS.cloudInit.insecureSkipSecretsManager,
  set: (val: boolean) => emit('update:cloudInitInsecureSkipSecretsManager', val),
});

const modelMarketType = computed({
  get: () => props.marketType || MACHINE_CONFIG_DEFAULTS.marketType,
  set: (val: string) => emit('update:marketType', val),
});

const securityGroupMode = ref((props.additionalSecurityGroups || []).length ? 'replace' : 'merge');

const securityGroupOptions = computed(() => SECURITY_GROUP_OPTIONS
  .map((o) => ({
    label: t(o.labelKey),
    value: o.value,
  })));

const existingSecurityGroupOptions = computed(() => {
  const groups = props.vpcId
    ? (props.securityGroups || []).filter((sg: Record<string, any>) => sg.VpcId === props.vpcId)
    : (props.securityGroups || []);

  return groups.map((sg: Record<string, any>) => ({
    label: sg.GroupName ? `${ sg.GroupName } (${ sg.GroupId })` : sg.GroupId,
    value: sg.GroupId,
  }));
});

const selectedSecurityGroupIds = computed({
  get() {
    return (props.additionalSecurityGroups || []).map((sg: Record<string, any>) => sg.id);
  },
  set(ids: string[]) {
    emit('update:additionalSecurityGroups', (ids || []).map((id: string) => ({ id })));
  },
});

const spotMaxPrice = computed({
  get() {
    return props.spotMarketMaxPrice;
  },
  set(maxPrice: string | number | null | undefined) {
    const normalized = (maxPrice === null || maxPrice === undefined || maxPrice === '') ? undefined : String(maxPrice);
    emit('update:spotMarketMaxPrice', normalized as string);
  },
});

const tags = computed({
  get() {
    return props.additionalTags;
  },
  set(additionalTags: Record<string, string>) {
    emit('update:additionalTags', additionalTags);
  },
});

function onSecurityGroupModeChange(mode: string) {
  securityGroupMode.value = mode;
  if ( mode !== 'replace' ) {
    emit('update:additionalSecurityGroups', []);
  }
}
</script>

<template>
  <RcSection
    :title="t('capa.machineConfig.advanced.title')"
    :expandable="true"
    mode="with-header"
    type="primary"
    :expanded="false"
  >
    <div>
      <p>{{ t('capa.machineConfig.advanced.cloudInit.title') }}</p>
      <Checkbox
        v-model:value="modelCloudInitInsecureSkipSecretsManager"
        :label="t('capa.machineConfig.advanced.cloudInit.disable.label')"
        class="mt-10"
        :mode="mode"
      />
    </div>

    <RadioGroup
      v-model:value="securityGroupMode"
      name="security-group"
      :options="securityGroupOptions"
      label-key="capa.machineConfig.advanced.securityGroup.label"
      class="mt-20 mb-10"
      :disabled="!vpcId"
      :mode="mode"
      @update:value="onSecurityGroupModeChange"
    />
    <LabeledSelect
      v-if="securityGroupMode === 'replace'"
      v-model:value="selectedSecurityGroupIds"
      :options="existingSecurityGroupOptions"
      :multiple="true"
      :mode="mode"
      :label="t('capa.machineConfig.advanced.securityGroup.existingLabel')"
      class="mb-10"
      :loading="loadingSecurityGroups"
    />

    <RcSection
      :title="t('capa.machineConfig.advanced.marketType.title')"
      :expandable="true"
      mode="with-header"
      type="secondary"
    >
      <p>{{ t('capa.machineConfig.advanced.marketType.description') }}</p>
      <RadioGroup
        v-model:value="modelMarketType"
        name="market-type"
        :mode="mode"
        :options="[
          { label: t('capa.machineConfig.advanced.marketType.options.onDemand'), value: MACHINE_CONFIG_DEFAULTS.marketType },
          { label: t('capa.machineConfig.advanced.marketType.options.spot'), value: 'Spot' },
          { label: t('capa.machineConfig.advanced.marketType.options.block'), value: 'CapacityBlock' },
        ]"
      />
      <div v-if="modelMarketType === 'Spot'">
        <UnitInput
          v-model:value="spotMaxPrice"
          label-key="capa.machineConfig.advanced.marketType.price.label"
          suffix="USD/h"
          class="mb-10"
          :mode="mode"
        />
        <p>{{ t('capa.machineConfig.advanced.marketType.price.description') }}</p>
      </div>
    </RcSection>

    <RcSection
      :title="t('capa.machineConfig.advanced.tags.title')"
      :expandable="true"
      mode="with-header"
      type="secondary"
    >
      <p>{{ t('capa.machineConfig.advanced.tags.description') }}</p>
      <KeyValue
        :mode="mode"
        :read-allowed="false"
        :as-map="true"
        :value="tags"
        :add-label="t('capa.machineConfig.advanced.tags.add')"
        data-testid="capa-resource-tags-input"
        @update:value="tags = $event"
      />
    </RcSection>
  </RcSection>
</template>
