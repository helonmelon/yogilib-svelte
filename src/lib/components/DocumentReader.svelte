<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { t } from '$lib/i18n';
  import { api, send, assetURL } from '$lib/client/api';
  import {
    canDelete,
    type ArchiveDocument,
    type Note,
    type Revision,
    type Progress,
  } from '$lib/types';
  import {
    addNote,
    deleteNote,
    localNotes,
    cacheNotes,
    sync,
    cachedProgress,
    saveProgress,
    acceptProgress,
  } from '$lib/client/offline';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import AICompanion from './AICompanion.svelte';
  let { data } = $props();
  const doc = $derived(data.doc as ArchiveDocument);
  const user = $derived(data.session.user);
  let body = $state<HTMLElement>();
  let toc = $state<{ id: string; text: string; level: string }[]>([]),
    message = $state(''),
    busy = $state(false),
    size = $state(21),
    spacing = $state(1.9),
    width = $state('100%'),
    split = $state(false),
    query = $state(''),
    found = $state(0),
    active = $state(0),
    quote = $state(''),
    note = $state(''),
    notes = $state<Note[]>([]),
    history = $state<Revision[]>([]),
    historyOpen = $state(false),
    progress = $state<Progress>({ position: 0, version: 0 }),
    conflict = $state<Progress | null>(null);
  let confirmDelete = $state(false), deleting = $state(false);
  let matches: Range[] = [];
  function status(e: unknown) {
    message = e instanceof Error ? e.message : String(e);
  }
  function prepare(node: HTMLElement, _html: string) {
    let remove = () => {};
    function setup() {
      toc = [];
      const counts = new Map<string, number>();
      node.querySelectorAll('h1,h2,h3,h4,p,li').forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (!text) return;
        let hash = 2166136261;
        for (const ch of text)
          hash = Math.imul(hash ^ (ch.codePointAt(0) || 0), 16777619);
        const base = 'passage-' + (hash >>> 0).toString(36),
          n = (counts.get(base) || 0) + 1;
        counts.set(base, n);
        if (!el.id) el.id = base + (n > 1 ? '-' + n : '');
        if (/^H/.test(el.tagName))
          toc.push({ id: el.id, text, level: el.tagName });
        const a = document.createElement('a');
        a.className = 'passage-link';
        a.href = '#' + el.id;
        a.textContent = '¶';
        a.setAttribute('aria-label', 'Copy link to this passage');
        a.onclick = async (e) => {
          e.preventDefault();
          const url = new URL(location.href);
          url.hash = el.id;
          window.history.replaceState(null, '', url);
          try {
            await navigator.clipboard.writeText(url.href);
            message = 'Passage link copied.';
          } catch {
            message = 'Copy the passage link from your address bar.';
          }
        };
        el.append(a);
      });
      toc = [...toc];
      if (location.hash) {
        try {
          document
            .getElementById(decodeURIComponent(location.hash.slice(1)))
            ?.scrollIntoView();
        } catch {}
      }
    }
    setup();
    return {
      update() {
        node.querySelectorAll('.passage-link').forEach((x) => x.remove());
        setup();
      },
      destroy() {
        remove();
      },
    };
  }
  function ranges(text: string) {
    if (!body || !text) return [];
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement?.closest('.passage-link')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    let full = '',
      n;
    const nodes: { node: Text; start: number }[] = [];
    while ((n = walk.nextNode())) {
      nodes.push({ node: n as Text, start: full.length });
      full += n.textContent;
    }
    const result: Range[] = [];
    let index = 0;
    const haystack = full.toLocaleLowerCase(),
      needle = text.toLocaleLowerCase();
    while (
      (index = haystack.indexOf(needle, index)) !== -1 &&
      result.length < 1000
    ) {
      const start = nodes.find((x) => x.start + x.node.length > index),
        end = nodes.find((x) => x.start + x.node.length >= index + text.length);
      if (start && end) {
        const r = new Range();
        r.setStart(start.node, index - start.start);
        r.setEnd(end.node, index + text.length - end.start);
        result.push(r);
      }
      index += Math.max(1, text.length);
    }
    return result;
  }
  function focus(delta = 0) {
    if (!matches.length) return;
    active = (active + delta + matches.length) % matches.length;
    matches[active].startContainer.parentElement?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
    const css = CSS as any;
    if ((window as any).Highlight && css.highlights)
      css.highlights.set(
        'yogilib-active',
        new (window as any).Highlight(matches[active]),
      );
    else {
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(matches[active]);
    }
  }
  function find() {
    matches = ranges(query);
    found = matches.length;
    active = 0;
    const css = CSS as any;
    if ((window as any).Highlight && css.highlights) {
      css.highlights.delete('yogilib-active');
      css.highlights.set(
        'yogilib-search',
        new (window as any).Highlight(...matches),
      );
    }
    focus();
  }
  function paintNotes() {
    const css = CSS as any;
    if ((window as any).Highlight && css.highlights)
      css.highlights.set(
        'yogilib-notes',
        new (window as any).Highlight(...notes.flatMap((n) => ranges(n.quote))),
      );
  }
  async function refreshNotes() {
    if (!user) return;
    try {
      const list = await api<Note[]>(`documents/${doc.id}/notes`);
      await cacheNotes(user.id, doc.id, list);
    } catch {}
    notes = await localNotes(user.id, doc.id);
    await tick();
    paintNotes();
  }
  async function saveNote() {
    if (!user || !quote.trim()) return;
    busy = true;
    try {
      await addNote(user.id, doc.id, quote, note);
      note = '';
      message = 'Saved on this device. Syncing when connected.';
      await refreshNotes();
      try {
        await sync(user.id);
        await refreshNotes();
        message = 'Saved privately to your account.';
      } catch {}
    } catch (e) {
      status(e);
    } finally {
      busy = false;
    }
  }
  async function removeNote(n: Note) {
    if (!user) return;
    try {
      await deleteNote(user.id, doc.id, n);
      notes = await localNotes(user.id, doc.id);
      await sync(user.id);
      await refreshNotes();
    } catch (e) {
      status(e);
    }
  }
  async function remove() {
    confirmDelete = true;
  }
  async function confirmRemove() {
    confirmDelete = false;
    deleting = true;
    try {
      await api(`documents/${doc.id}`, { method: 'DELETE' });
      await goto('/');
    } catch (e) {
      status(e);
    } finally {
      deleting = false;
    }
  }
  async function loadHistory() {
    historyOpen = !historyOpen;
    if (historyOpen)
      try {
        history = await api(`documents/${doc.id}/revisions`);
      } catch (e) {
        status(e);
      }
  }
  async function restore(id: string) {
    if (
      !confirm(
        'Restore this version? The current version will be saved in history.',
      )
    )
      return;
    try {
      await send(`documents/${doc.id}/revisions/${id}`, {
        version: doc.version,
      });
      await invalidateAll();
      history = await api(`documents/${doc.id}/revisions`);
    } catch (e) {
      status(e);
    }
  }
  function remember() {
    try {
      localStorage.setItem(
        'yogilib-reader-v2',
        JSON.stringify({ size, spacing, width }),
      );
    } catch {}
  }
  async function position() {
    if (!user) return;
    const top = (body?.getBoundingClientRect().top || 0) + window.scrollY;
    const total = Math.max(1, (body?.scrollHeight || 0) - window.innerHeight);
    progress = {
      ...progress,
      position: Math.max(0, Math.min(1, (window.scrollY - top) / total)),
    };
    await saveProgress(user.id, doc.id, progress);
    message = 'Reading position saved on this device.';
    try {
      const conflicts = await sync(user.id);
      if (conflicts.includes(doc.id))
        conflict = await api(`documents/${doc.id}/progress`);
      else progress = await cachedProgress(user.id, doc.id);
    } catch {}
  }
  function resume() {
    if (body)
      window.scrollTo({
        top:
          body.getBoundingClientRect().top +
          window.scrollY +
          progress.position *
            Math.max(1, body.scrollHeight - window.innerHeight),
        behavior: 'smooth',
      });
  }
  async function resolvePosition(keep: boolean) {
    if (!user || !conflict) return;
    try {
      if (keep) {
        progress = { position: progress.position, version: conflict.version };
        await saveProgress(user.id, doc.id, progress);
        await sync(user.id);
      } else {
        progress = conflict;
        await acceptProgress(user.id, doc.id, progress);
        resume();
      }
      conflict = null;
    } catch (e) {
      status(e);
    }
  }
  onMount(() => {
    let alive = true;
    try {
      const prefs = JSON.parse(
        localStorage.getItem('yogilib-reader-v2') || '{}',
      );
      size = Number(prefs.size) || 21;
      spacing = Number(prefs.spacing) || 1.9;
      width = prefs.width || '100%';
    } catch {}
    refreshNotes();
    if (user)
      cachedProgress(user.id, doc.id)
        .then((p) => {
          if (alive) progress = p;
          return api<Progress>(`documents/${doc.id}/progress`);
        })
        .then((p) => {
          if (alive && progress.version === 0 && progress.position === 0)
            progress = p;
        })
        .catch(() => {});
    const selection = () => {
      const s = getSelection();
      if (
        s?.rangeCount &&
        body?.contains(s.anchorNode) &&
        body.contains(s.focusNode)
      ) {
        const f = s.getRangeAt(0).cloneContents();
        f.querySelectorAll('.passage-link').forEach((e) => e.remove());
        const text = f.textContent?.trim();
        if (text) quote = text.slice(0, 10000);
      }
    };
    document.addEventListener('selectionchange', selection);
    return () => {
      alive = false;
      document.removeEventListener('selectionchange', selection);
      const css = CSS as any;
      for (const key of ['yogilib-search', 'yogilib-active', 'yogilib-notes'])
        css.highlights?.delete(key);
    };
  });
</script>

<svelte:head
  ><title>{doc.title} · Yogilib</title><meta
    name="description"
    content={doc.description}
  /></svelte:head
>
<div class="reader-grid">
  <aside class="contents">
    <details open>
      <summary>{$t('Table of contents')}</summary>
      <nav>
        {#each toc as h}<a
            class:sub={h.level === 'H3' || h.level === 'H4'}
            href={'#' + h.id}>{h.text}</a
          >{/each}
      </nav>
    </details>
  </aside>
  <section class="reader-main">
    <div class="reader-meta">
      <span class="tag">{$t(doc.category)}</span><span
        >{doc.lang} · {doc.script}</span
      >{#if data.fromDownload}<span class="tag">{$t('Offline')}</span>{/if}<span
        class="reader-actions"
        >{#if user?.role === 'admin'}<a
            class="button"
            href={`/document/${doc.id}/edit`}>{$t('Edit')}</a
          >{/if}{#if canDelete(user, doc)}<button
            class="danger"
            onclick={remove}>{$t('Delete')}</button
          >{/if}</span
      >
    </div>
    <h1 class="document-title">{doc.title_np || doc.title}</h1>
    {#if doc.title_np}<p class="document-subtitle">{doc.title}</p>{/if}
    <p class="byline">
      {doc.orig_author_np || doc.orig_author}
      {doc.orig_year
        ? '· ' +
          [doc.orig_year, doc.orig_month, doc.orig_day]
            .filter(Boolean)
            .join('-')
        : ''}
    </p>
    <p class="description">{doc.description}</p>
    <div class="download-bar">
      {#if doc.file_path}<a
          href={assetURL(doc.file_path)}
          target="_blank"
          rel="noopener">{$t('View original')}</a
        >{/if}{#if user}<button onclick={position}
          >{$t('Save reading position')}</button
        >{#if progress.position > 0}<button onclick={resume}
            >{$t('Resume reading')}</button
          >{/if}{/if}
    </div>
    <div role="status" class="reader-status">{$t(message)}</div>
    {#if conflict}<div class="notice">
        <p>{$t('Reading position conflict')}</p>
        <button onclick={() => resolvePosition(true)}
          >{$t('Keep this device position')}</button
        ><button onclick={() => resolvePosition(false)}
          >{$t('Use synced position')}</button
        >
      </div>{/if}
    <div class:split class="reading-columns">
      <article
        bind:this={body}
        use:prepare={doc.body_html}
        class="document-body"
        style={`font-size:${size}px;line-height:${spacing};max-width:${width}`}
        lang={doc.lang.startsWith('ne')
          ? 'ne'
          : doc.lang.startsWith('sa')
            ? 'sa'
            : 'en'}
      >
        {@html doc.body_html}
</article>
<ConfirmDialog
  open={confirmDelete}
  title="Delete document?"
  message="This document will be permanently deleted. This cannot be undone."
  busy={deleting}
  onconfirm={confirmRemove}
  oncancel={() => (confirmDelete = false)}
/>
      {#if doc.file_path}<div class="original">
          {#if /\.(png|jpe?g|webp)$/i.test(doc.file_path)}<img
              src={assetURL(doc.file_path)}
              alt="Original document scan"
            />{:else}<object
              type="application/pdf"
              data={assetURL(doc.file_path)}
              aria-label="Original document"
              ><a href={assetURL(doc.file_path)}
                >{$t('View original')}</a
              ></object
            >{/if}
        </div>{/if}
    </div>
    <AICompanion docId={doc.id} {user} passage={quote} />
    <section class="notes">
      <h2>{$t('Private notes')}</h2>
      {#if user}<p>
          {$t(
            'Select a passage in the text, then save a highlight or add a note. Notes are private to your account.',
          )}
        </p>
        <label
          >{$t('Selected passage')}<textarea
            bind:value={quote}
            maxlength="10000"
            rows="2"></textarea></label
        ><label
          >{$t('Add an optional note')}<textarea
            bind:value={note}
            maxlength="5000"
            rows="3"></textarea></label
        ><button
          class="primary"
          disabled={busy || !quote.trim()}
          onclick={saveNote}>{$t('Save highlight / note')}</button
        >{#each notes as n}<div class="note-card">
            <blockquote>{n.quote}</blockquote>
            <p>{n.note}</p>
            <button
              onclick={() => {
                query = n.quote;
                find();
              }}>{$t('Find passage')}</button
            ><button onclick={() => removeNote(n)}>{$t('Delete')}</button>
          </div>{/each}{:else}<a href="/login">{$t('Sign in')}</a>{/if}
    </section>
    {#if user?.role === 'admin'}<section class="revisions">
        <button onclick={loadHistory} aria-expanded={historyOpen}
          >{$t('Revision history')}</button
        >{#if historyOpen}{#each history as r}<details>
              <summary>{String(r.created_at)} · {r.snapshot.title}</summary>
              <p class="revision-text">{r.snapshot.body_text}</p>
              <button onclick={() => restore(r.id)}
                >{$t('Restore this version')}</button
              >
            </details>{:else}<p>
              {$t('No previous versions yet.')}
            </p>{/each}{/if}
      </section>{/if}
  </section>
  <aside class="reader-tools">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        find();
      }}
    >
      <label
        >{$t('Find in document')}<input
          type="search"
          bind:value={query}
          maxlength="200"
        /></label
      >
      <div class="tool-buttons">
        <button>{$t('Find')}</button><button
          type="button"
          aria-label="Previous match"
          onclick={() => focus(-1)}>↑</button
        ><button type="button" aria-label="Next match" onclick={() => focus(1)}
          >↓</button
        >
      </div>
      <output aria-live="polite"
        >{found ? `${active + 1} / ${found}` : ''}</output
      >
    </form>
    <h2>{$t('Reading tools')}</h2>
    <label
      >{$t('Font size')}<input
        type="range"
        min="16"
        max="36"
        bind:value={size}
        oninput={remember}
      /></label
    ><label
      >{$t('Line spacing')}<input
        type="range"
        min="1.4"
        max="2.6"
        step="0.1"
        bind:value={spacing}
        oninput={remember}
      /></label
    ><label
      >{$t('Page width')}<select bind:value={width} onchange={remember}
        ><option value="640px">{$t('Narrow')}</option><option value="800px"
          >{$t('Comfortable')}</option
        ><option value="100%">{$t('Wide')}</option></select
      ></label
    >{#if doc.file_path}<button
        aria-pressed={split}
        onclick={() => (split = !split)}
        >{$t('Original + transcription')}</button
      >{/if}
  </aside>
</div>
