<!-- DynamicHeading.vue -->
<script>

export default {
  props: {
    text: {
      default: [],
    },
    renderFunc: {
      default: (item) => item,
    },
  },

  setup(props) {
    return () => {
      return props.renderFunc(props.text);
    };
  },
};
</script>
