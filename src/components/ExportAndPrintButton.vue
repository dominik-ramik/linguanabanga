<script setup>
const print = () => {
  window.setTimeout(() => {
    window.print();
  }, 200);
};
</script>

<template>
  <v-dialog max-width="500">
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn
        prepend-icon="mdi-printer"
        v-bind="activatorProps"
        variant="tonal"
        class="mb-3"
        color="primary"
        block
        >Export and print</v-btn
      >
    </template>

    <template v-slot:default="{ isActive }">
      <v-card title="Export and print">
        <v-card-text style="min-height: 340px">
          <v-btn
            prepend-icon="mdi-printer"
            v-bind="activatorProps"
            variant="tonal"
            class="mb-3"
            color="primary"
            block
            @click="
              isActive.value = false;
              print();
            "
            >Print</v-btn
          >
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>
