<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  let { data } = $props();
</script>

<ArchiveList {data} admin />
