<script lang="ts">
  import DocumentReader from '$lib/components/DocumentReader.svelte';
  let { data } = $props();
</script>

{#key data.doc.id}<DocumentReader {data} />{/key}
