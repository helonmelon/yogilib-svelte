<script lang="ts">
  import DocumentEditor from '$lib/components/DocumentEditor.svelte';
  let { data } = $props();
</script>

{#key data.doc.id}<DocumentEditor doc={data.doc} />{/key}
