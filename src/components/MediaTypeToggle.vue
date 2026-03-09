<script setup>
/**
 * Reusable single-media-type filter toggle.
 *
 * Props:
 *   modelValue  – current filter value ('all' | 'with' | 'without')
 *   icon        – Vuetify / MDI icon string, e.g. 'mdi-volume-high'
 *   options     – Array<{ title: string, value: string }>
 *   label       – optional accessible label shown as a tooltip / aria-label
 */
const props = defineProps({
  modelValue: {
    type: String,
    default: "all",
  },
  icon: {
    type: String,
    required: true,
  },
  options: {
    type: Array,
    required: true,
  },
  label: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue"]);
</script>

<template>
  <div class="d-flex align-center gap-2" :aria-label="label || undefined">
    <v-btn-toggle
      :model-value="props.modelValue"
      @update:model-value="emit('update:modelValue', $event)"
      mandatory
      density="compact"
      variant="outlined"
      color="primary"
      class="mb-2"
      style="margin-left: auto; margin-right: auto;"
    >
      <v-btn
        v-for="(opt, index) in props.options "
        :key="opt.value"
        :value="opt.value"
        size="small"
        :prepend-icon="index == 0 ? props.icon : undefined"
      >
        {{ opt.title }}
      </v-btn>
    </v-btn-toggle>
  </div>
</template>
