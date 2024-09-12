<script setup>
import { ref, computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";

const dictionaryStore = useDictionaryStore();

const addDialogShown = ref(false);

const favName = ref("");

function hrefLocation(newLocation) {
  if (newLocation === undefined) {
    return window.location.href;
  } else {
    window.location.href = newLocation;
  }
}

function saveFavorite() {
  dictionaryStore.favorites.add(
    favName.value.trim(),
    hrefLocation(),
    dictionaryStore.filter.table
  );
  favName.value = "";
  return true;
}

const favoriteNameAlreadyUsed = computed(() => {
  return dictionaryStore.favorites.all.find(
    (fav) => fav.name === favName.value
  );
});
</script>

<template>
  <div class="d-flex">
    <v-menu :location="location">
      <template v-slot:activator="{ props }">
        <v-btn
          style="flex-grow: 1"
          prepend-icon="mdi-heart"
          v-bind="props"
          variant="tonal"
          color="primary"
          >Favorites</v-btn
        >
      </template>

      <v-list>
        <v-list-item v-if="dictionaryStore.favorites.all?.length == 0">
          <div style="max-width: 200px">
            <div>You didn't save any favorites yet</div>
            <div class="text-caption mt-3">
              Click on the 'Add' button to add the currently displayed results to favorites.
            </div>
          </div>
        </v-list-item>
        <v-list-item
          v-for="fav in dictionaryStore.favorites.all"
          v-bind:key="fav.name"
          style="width: 100%"
          @click="hrefLocation(fav.url)"
        >
          <div class="d-flex align-center" style="max-width: 450px">
            {{ fav.name }}
            <v-spacer></v-spacer>
            <v-btn
              class="ml-1"
              icon="mdi-delete"
              variant="plain"
              color="primary"
              @click.stop="dictionaryStore.favorites.delete(fav.name)"
            >
            </v-btn>
          </div>
        </v-list-item>
      </v-list>
    </v-menu>
    <v-btn
      class="ml-1"
      v-bind="activatorProps"
      prepend-icon="mdi-heart-plus"
      variant="tonal"
      color="primary"
      text="Add"
      @click="addDialogShown = true"
    >
    </v-btn>
  </div>

  <v-dialog max-width="500" v-model="addDialogShown">
    <template v-slot:default="{ isActive }">
      <v-card title="Add to favorites">
        <v-card-text>
          <v-text-field v-model="favName" label="Favorite name"></v-text-field>
          <div v-if="favoriteNameAlreadyUsed" class="text-caption">
            This name is already in use. If you save it, the existing favorite
            will be updated to this new location.
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            :disabled="!(favName.trim().length > 0)"
            text="Save"
            variant="tonal"
            color="primary"
            @click="if (saveFavorite()) isActive.value = false;"
          ></v-btn>
          <v-btn text="Close" @click="isActive.value = false"></v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>
