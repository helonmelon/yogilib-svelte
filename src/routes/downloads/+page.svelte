<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { downloads, removeDownload } from '$lib/client/offline';
  import type { ArchiveDocument } from '$lib/types';
  let docs = $state<ArchiveDocument[]>([]),
    query = $state(''),
    error = $state('');
  onMount(() => {
    downloads()
      .then((x) => (docs = x))
      .catch((e) => (error = e.message));
  });
  async function remove(id: string) {
    try {
      await removeDownload(id);
      docs = await downloads();
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const filtered = $derived(
    docs.filter((d) =>
      [d.title, d.title_np, d.body_text]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
</script>

<section class="archive">
  <span class="eyebrow">YOGILIB / OFFLINE</span>
  <h1>{$t('Downloaded works')}</h1>
  <label
    >{$t('Search downloaded works')}<input
      type="search"
      bind:value={query}
    /></label
  >{#if error}<p class="error">{error}</p>{/if}{#each filtered as d}<article
      class="document-row"
    >
      <div class="document-summary">
        <span class="eyebrow">{$t('Saved offline')}</span>
        <h2><a href={`/document/${d.id}`}>{d.title_np || d.title}</a></h2>
        <p>{d.title}</p>
      </div>
      <button onclick={() => remove(d.id)}>{$t('Remove download')}</button>
    </article>{:else}<div class="empty">
      <h2>{$t('No downloads yet.')}</h2>
      <p>{$t('Save a work from its reading page to read without internet.')}</p>
    </div>{/each}
</section>
