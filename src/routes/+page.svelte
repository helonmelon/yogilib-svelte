<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { t } from '$lib/i18n';
  let { data } = $props();
</script>

{#if !data.session?.user && !data.query && data.category === 'सबै'}<section class="hero">
    <div>
      <span class="eyebrow">{$t('A living time capsule')}</span>
      <h1>{$t('The writings of Yogi Narharinath and the records of Nepal, open to everyone.')}</h1>
      <p>{$t('Read original scans beside careful transcriptions, search every word, and keep private notes as you go.')}</p>
    </div>
    <div class="hero-actions">
      <a class="button primary" href="#query">{$t('Start reading')}</a>
      <a class="button" href="/join">{$t('Create a free reader account')}</a>
    </div>
  </section>{/if}
<ArchiveList {data} />
