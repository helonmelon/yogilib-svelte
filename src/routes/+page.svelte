<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import Welcome from '$lib/components/Welcome.svelte';
  let { data } = $props();
</script>

<Welcome signedIn={!!data.session?.user} />
<ArchiveList {data} />
