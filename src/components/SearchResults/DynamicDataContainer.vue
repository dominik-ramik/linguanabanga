<script setup>
import { h, computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { deepCheckHasDisplayableData } from "@/utils/deepCheckHasDisplayableData.js";
import { micromark } from "micromark";
import { highlightText } from "@/utils/highlightText";
import { postprocessEncodedShortcode } from "@/utils/shortcodesProcessor.js";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";

const appSettings = useAppSettingsStore();
const dictionaryStore = useDictionaryStore();

const props = defineProps([
  "passThroughData",
  "currentData",
  "layout",
  "lastIdProp",
  "lastTableTypeProp",
]);

//Returns current data for cases when layout name is supplied (properties) or is not (each)
const data = computed(() => {
  if (props.layout && props.layout.name) {
    return props.currentData[props.layout.name];
  }
  return props.currentData;
});

const lastId = data.value?.id || props.lastIdProp;
const lastTableType =
  data.value?.__meta?.table?.tableType || props.lastTableTypeProp;

const currentStyle = computed(() => {
  if (props.layout.meta.style) {
    return (
      props.layout.meta.style
        .split(" ")
        .map((styleItem) => {
          if (styleItem === "colored") {
            return "text-primary";
          } else {
            return styleItem;
          }
        })
        .join(" ") + " font-italic"
    );
  } else {
    return "font-italic";
  }
});

const hasDisplayableData = computed(() => {
  if (props.layout.meta.renderAs.startsWith("list-of-references-in:")) {
    const references = dictionaryStore.getReferencesList(
      lastId,
      props.layout.meta.tableType,
      paramsOfRenderAs.value[0]
    );
    if (references.length > 0) {
      return true;
    } else {
      return false;
    }
  }

  return deepCheckHasDisplayableData(
    data.value,
    props.layout,
    lastId,
    paramsOfRenderAs.value
  );
});

const paramsOfRenderAs = computed(() => {
  if (props.layout.meta.renderAs && props.layout.meta.renderAs.includes(":")) {
    const paramsPart = props.layout.meta.renderAs.substring(
      props.layout.meta.renderAs.indexOf(":") + 1
    );

    return paramsPart.split(",").map((param) => param.trim());
  } else {
    return [];
  }
});

function deepGatherAndPostprocess(layout, currentData, disablePostprocessing) {
  if (layout.properties) {
    return layout.properties
      .map((p) => {
        const value = currentData[p.name];
        if (Array.isArray(value)) {
          return value
            .map((v) => deepGatherAndPostprocess(layout, v))
            .join(" / ");
        } else if (typeof value === "object") {
          //TODO develop this to parse full objects
          return JSON.stringify(value);
        } else {
          let data = value || currentData;
          return disablePostprocessing
            ? data
            : postprocessStringData(data, {
                highlightMatches: props.passThroughData?.matches?.filter(
                  (match) => match.key == p.fullPathHashless
                ),
                markdown: layout.sheetDataDetails.type === "markdown",
              });
        }
      })
      .join(" ");
  } else if (layout.name) {
    return disablePostprocessing
      ? currentData
      : postprocessStringData(currentData, {
          highlightMatches: props.passThroughData?.matches?.filter(
            (match) => match.key == layout.fullPathHashless
          ),
          markdown: layout.sheetDataDetails?.type === "markdown",
        });
  }
  return "";
}

const postprocessedTextFormatted = computed(() => {
  return deepGatherAndPostprocess(props.layout, data.value, false);
});

const postprocessedTextPlain = computed(() => {
  return deepGatherAndPostprocess(props.layout, data.value, true);
});

const urlRegex = new RegExp(/^(https:|http:|www\.)\S*/gm);
function postprocessStringData(text, options) {
  if (text === undefined || typeof text !== "string") {
    return text;
  }

  const { highlightMatches = [], markdown = false } = options || {};

  let result = text;

  //Highlight matches ... it has to be the first postprocessing done on the text
  if (highlightMatches.length > 0) {
    result = highlightText(
      result,
      highlightMatches,
      dictionaryStore.filter.text,
      appSettings.colorFullMatch,
      appSettings.colorPartialMatch
    );
  }

  //Make links clickable
  if (
    (result.startsWith("http://") || result.startsWith("https://")) &&
    urlRegex.test(result)
  ) {
    result =
      "<a href='" +
      result +
      "' target='_blank' style='color: rgb(var(--v-theme-primary))'>" +
      result +
      "</a>";
  }

  //Process markdown
  if (markdown) {
    result = micromark(result);
  }

  return result;
}

import NavigationChip from "@/components/SearchResults/NavigationChip.vue";
function postCode(text) {
  return postprocessEncodedShortcode(
    text,
    dictionaryStore.dictionary.shortcodes,
    function (text, tableType, id) {
      return h(NavigationChip, {
        text: text,
        actionType: "single-item-view",
        dataTableType: tableType,
        dataId: id,
      });
    },
    function (text) {
      return h(
        "span",
        {
          innerHTML: text,
        },
        []
      );
    }
  );
}
</script>

<template>
  <div class="dynamic-data-container" v-if="data && hasDisplayableData">
    <span
      :style="
        'font-variant: small-caps; font-size: 120%;' +
        (props.layout.meta.itemsSeparator == 'space-on-new-line'
          ? 'display: block;'
          : '')
      "
      class="font-weight-bold mr-1"
      v-if="
        props.layout.meta.title &&
        props.layout.meta.renderAs != 'link-single-view'
      "
    >
      {{ props.layout.meta.title }}
    </span>

    <div
      v-if="props.layout.meta.renderAs.startsWith('list-of-references-in:')"
      class="iterator-container separator-bullet-list"
    >
      <ShowMoreItems
        :items="
          dictionaryStore
            .getReferencesList(
              lastId,
              props.layout.meta.tableType,
              paramsOfRenderAs[0]
            )
            .map((r) => {
              return { id: r.id, main: r.main?.join('/'), languageName: r.languageName };
            })
        "
        :maxItemsShown="10"
        v-slot="slotProps"
      >
        <div class="ml-2">
          <navigation-chip
            :text="slotProps.currentItem.main"
            actionType="single-item-view"
            :data-table-type="paramsOfRenderAs[0]"
            :data-id="slotProps.currentItem.id"
          />
          <template v-if="slotProps.currentItem.languageName">
            ({{ slotProps.currentItem.languageName }})
          </template>
        </div>
      </ShowMoreItems>
    </div>
    <navigation-chip
      v-else-if="props.layout.meta.renderAs == 'chip-external-url'"
      :text="'Open'"
      :data-url="data"
      actionType="external-url"
    />
    <navigation-chip
      v-else-if="props.layout.meta.renderAs == 'chip-single-item-view'"
      :text="props.layout.meta.title || postprocessedTextFormatted"
      actionType="single-item-view"
      :data-table-type="lastTableType"
      :data-id="props.layout.name == 'id' ? data : lastId"
    />
    <navigation-chip
      v-else-if="props.layout.meta.renderAs == 'chip-search-text'"
      :text="postprocessedTextFormatted"
      actionType="search"
      :data-table-type="props.layout.meta.tableType"
      :data-search-text="postprocessedTextPlain"
    />
    <navigation-chip
      v-else-if="props.layout.meta.renderAs == 'chip-filter'"
      :text="postprocessedTextFormatted"
      actionType="filter"
      :data-id="data.id"
      :data-table-type="props.layout.meta.tableType"
      :data-filter-name="
        props.layout.meta.closestReferenceFilter.replaceAll('#', '')
      "
    />
    <AudioPlayerButton
      v-else-if="props.layout.meta.renderAs == 'audio'"
      :additionalData="props.currentData"
      :additionalLayout="props.layout"
      :src="data.source"
    />
    <ExpandableImage
      v-else-if="props.layout.meta.renderAs == 'image'"
      :additionalData="data"
      :additionalLayout="props.layout"
      :src="data.source"
    />
    <div
      v-else-if="props.layout.properties && props.layout.properties.length > 0"
      :class="
        'iterator-container separator-' +
        (props.layout.meta.itemsSeparator
          ? props.layout.meta.itemsSeparator
          : 'plain')
      "
    >
      <DynamicDataContainer
        v-for="(layout, index) in props.layout.properties"
        v-bind:key="index"
        :passThroughData="props.passThroughData"
        :currentData="data"
        :layout="layout"
        :lastIdProp="lastId"
        :lastTableTypeProp="lastTableType"
      />
    </div>
    <div
      v-else-if="props.layout.each"
      :class="
        'iterator-container separator-' +
        (props.layout.meta.itemsSeparator
          ? props.layout.meta.itemsSeparator
          : 'plain')
      "
    >
      <DynamicDataContainer
        v-for="(arrayItem, index) in data"
        v-bind:key="index + props.layout.name"
        :passThroughData="props.passThroughData"
        :currentData="arrayItem"
        :layout="props.layout.each"
        :lastIdProp="lastId"
        :lastTableTypeProp="lastTableType"
      />
    </div>
    <template v-else-if="data">
      <span
        :class="
          currentStyle +
          (props.layout.sheetDataDetails?.type == 'markdown' ? ' markdown' : '')
        "
      >
        <custom-render
          :text="postprocessedTextFormatted"
          :renderFunc="postCode"
        ></custom-render>
      </span>
    </template>
  </div>
</template>

<style>
.dynamic-data-container {
  margin-bottom: 0.75em;
}
.dynamic-data-container * {
  vertical-align: top;
}

v-card-header .dynamic-data-container {
  margin: 0;
}
.dynamic-data-container .dynamic-data-container {
  margin: 0;
}
.iterator-container {
  display: inline-block;
}

.separator-plain > .dynamic-data-container {
  display: inline-block;
}

.separator-bullet-list {
  display: block;
  margin-left: 1em;
}
.separator-bullet-list > .dynamic-data-container {
  display: list-item;
  margin-left: 1em;
  list-style-type: disc;
}
.separator-bullet-list > .dynamic-data-container * {
  vertical-align: top;
}

.separator-numbered-list {
  display: block;
  margin-left: 1em;
}
.separator-numbered-list > .dynamic-data-container {
  display: list-item;
  list-style-type: decimal;
  margin-left: 1em;
}
.separator-numbered-list > .dynamic-data-container * {
  vertical-align: top;
}

.separator-plain-list {
  display: block;
}
.separator-plain-list > .dynamic-data-container {
  display: list-item;
  list-style-type: none;
}
.separator-plain-list > .dynamic-data-container * {
  vertical-align: top;
}

.separator-space > .dynamic-data-container {
  display: inline-block;
  margin-left: 0.25em;
}
.separator-space > .dynamic-data-container:not(:first-child)::before {
  content: " ";
}

.separator-space-on-new-line > .dynamic-data-container {
  display: inline-block;
}
.separator-space-on-new-line
  > .dynamic-data-container:not(:first-child)::before {
  content: " ";
}

.separator-comma > .dynamic-data-container {
  display: inline-block;
  margin-right: 0.5em;
}
.separator-comma > .dynamic-data-container:not(:last-child)::after {
  content: ", ";
}
</style>
