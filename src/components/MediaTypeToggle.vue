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
  <v-select
    :model-value="props.modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :items="props.options"
    item-title="title"
    item-value="value"
    :prepend-inner-icon="props.icon"
    :aria-label="label || undefined"
    density="compact"
    variant="outlined"
    color="primary"
    hide-details
    class="media-type-select"
  />
</template>
