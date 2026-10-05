<script lang="ts">
  import { onMount } from 'svelte';
  import {
    downloads,
    originalURL,
    addNote,
    localNotes,
  } from '../lib/client/offline';
  import { locale, t } from '../lib/i18n';
  import type { ArchiveDocument, Note } from '../lib/types';
  let docs = $state<ArchiveDocument[]>([]),
    doc = $state<ArchiveDocument | null>(null),
    query = $state(''),
    size = $state(21),
    original = $state(''),
    user = $state<string | null>(null),
    quote = $state(''),
    note = $state(''),
    notes = $state<Note[]>([]),
    message = $state('');
  const filtered = $derived(
    docs.filter((d) =>
      [d.title, d.title_np, d.body_text]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  async function open(d: ArchiveDocument) {
    if (original.startsWith('blob:')) URL.revokeObjectURL(original);
    doc = d;
    original = await originalURL(d.id);
    if (user) notes = await localNotes(user, d.id);
  }
  async function save() {
    if (!user || !doc || !quote.trim()) return;
    try {
      await addNote(user, doc.id, quote, note);
      note = '';
      notes = await localNotes(user, doc.id);
      message = 'Saved on this device. Syncing when connected.';
    } catch (e) {
      message = (e as Error).message;
    }
  }
  onMount(() => {
    locale.set(localStorage.getItem('yogilib-language') === 'ne' ? 'ne' : 'en');
    try {
      user =
        JSON.parse(localStorage.getItem('yogilib-identity') || 'null')?.user
          ?.id || null;
    } catch {}
    downloads()
      .then(async (d) => {
        docs = d;
        const id = location.pathname.match(/^\/document\/(\d+)$/)?.[1];
        const current = d.find((x) => x.id === id);
        if (current) await open(current);
      })
      .catch((e) => (message = e.message));
  });
</script>

<header class="masthead">
  <a class="brand" href="/">Yogilib</a><span class="tag">{$t('Offline')}</span>
</header>
<main>
  <section class="archive">
    {#if doc}<button onclick={() => (doc = null)}>{$t('Downloads')}</button>
      <h1>{doc.title_np || doc.title}</h1>
      <p>{doc.title}</p>
      <label
        >{$t('Font size')}<input
          type="range"
          min="16"
          max="36"
          bind:value={size}
        /></label
      >{#if original}<a
          class="button"
          href={original}
          target="_blank"
          rel="noopener">{$t('View original')}</a
        >{/if}
      <article
        class="document-body"
        style={`font-size:${size}px;line-height:1.9`}
      >
        {@html doc.body_html}
      </article>
      {#if user}<section class="notes">
          <h2>{$t('Private notes')}</h2>
          <label
            >{$t('Selected passage')}<textarea
              bind:value={quote}
              maxlength="10000"></textarea></label
          ><label
            >{$t('Add an optional note')}<textarea
              bind:value={note}
              maxlength="5000"></textarea></label
          ><button onclick={save}>{$t('Save note')}</button
          >{#each notes as n}<blockquote>
              {n.quote}
              <p>{n.note}</p>
            </blockquote>{/each}
        </section>{/if}{:else}<h1>{$t('Downloaded works')}</h1>
      <label
        >{$t('Search downloaded works')}<input
          type="search"
          bind:value={query}
        /></label
      >{#each filtered as d}<article class="document-row">
          <div>
            <h2>
              <button class="quiet" onclick={() => open(d)}
                >{d.title_np || d.title}</button
              >
            </h2>
            <p>{d.title}</p>
          </div>
        </article>{:else}<p>{$t('No downloads yet.')}</p>{/each}{/if}
    <p role="status">{$t(message)}</p>
    <p><a href="/">{$t('Back to archive')}</a></p>
  </section>
</main>
