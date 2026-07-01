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
import { SECURITY_GROUP_OPTIONS } from './constants';

defineOptions({ name: 'AdvancedSection' });

interface Props {
  value: Record<string, any>;
  mode?: string;
  securityGroups?: Record<string, any>[];
  vpcId?: string;
  loadingSecurityGroups?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode:                  'create',
  securityGroups:        () => [],
  vpcId:                 '',
  loadingSecurityGroups: false,
});

const store = useStore();
const { t } = useI18n(store);

const securityGroupMode = ref(props.value.additionalSecurityGroups?.length ? 'replace' : 'merge');

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
    return (props.value.additionalSecurityGroups || []).map((sg: Record<string, any>) => sg.id);
  },
  set(ids: string[]) {
    props.value.additionalSecurityGroups = (ids || []).map((id: string) => ({ id }));
  },
});

const spotMaxPrice = computed({
  get() {
    return props.value.spotMarketOptions?.maxPrice;
  },
  set(maxPrice: string | number | null | undefined) {
    const normalized = (maxPrice === null || maxPrice === undefined || maxPrice === '') ? undefined : String(maxPrice);
    props.value.spotMarketOptions = { ...props.value.spotMarketOptions, maxPrice: normalized };
  },
});

const tags = computed({
  get() {
    return props.value.additionalTags;
  },
  set(additionalTags: Record<string, string>) {
    props.value.additionalTags = additionalTags;
  },
});

function onSecurityGroupModeChange(mode: string) {
  securityGroupMode.value = mode;
  if ( mode !== 'replace' ) {
    props.value.additionalSecurityGroups = [];
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
        v-model:value="value.cloudInit.insecureSkipSecretsManager"
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
        v-model:value="value.marketType"
        name="market-type"
        :mode="mode"
        :options="[
          { label: t('capa.machineConfig.advanced.marketType.options.onDemand'), value: 'OnDemand' },
          { label: t('capa.machineConfig.advanced.marketType.options.spot'), value: 'Spot' },
          { label: t('capa.machineConfig.advanced.marketType.options.block'), value: 'CapacityBlock' },
        ]"
      />
      <div v-if="value.marketType === 'Spot'">
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
