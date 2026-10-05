<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { t, dirty } from '$lib/i18n';
  import { api, send } from '$lib/client/api';
  import { categories, type ArchiveDocument } from '$lib/types';
  import { preetiToUnicode } from '$lib/converters/preeti-unicode';
  import { itransToUnicode } from '$lib/converters/itrans-unicode';
  import 'quill/dist/quill.snow.css';
  let { doc = null }: { doc?: ArchiveDocument | null } = $props();
  let form = $state<Record<string, string>>(
    untrack(() => ({
      title: doc?.title || '',
      title_np: doc?.title_np || '',
      category: doc?.category || 'किताब',
      description: doc?.description || '',
      body_html: doc?.body_html || '',
      lang: doc?.lang || 'ne',
      script: doc?.script || 'देवनागरी',
      orig_author: doc?.orig_author || '',
      orig_author_np: doc?.orig_author_np || '',
      orig_year: doc?.orig_year || '',
      orig_month: doc?.orig_month || '',
      orig_day: doc?.orig_day || '',
      version: doc?.version || '',
    })),
  );
  let host: HTMLDivElement;
  let editor: any;
  let source = $state(false),
    converterChoice = $state(''),
    conversion = $state(''),
    converted = $derived(
      converterChoice === 'preeti'
        ? preetiToUnicode(conversion)
        : itransToUnicode(conversion),
    ),
    wordCount = $derived(
      form.body_html.replace(/<[^>]*>/g, ' ').trim()
        ? form.body_html.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length
        : 0,
    ),
    busy = $state(false),
    error = $state(''),
    file = $state<File | null>(null),
    ready = $state(false),
    npMode = $state('unicode');
  const labels: Record<string, string> = {
    title: 'Title',
    title_np: 'Nepali title',
    description: 'Description',
    orig_author: 'Original author',
    orig_author_np: 'Nepali author',
    orig_year: 'Original year',
    orig_month: 'Original month',
    orig_day: 'Original day',
  };
  onMount(() => {
    let active = true;
    import('quill')
      .then(({ default: Quill }) => {
        if (!active) return;
        editor = new Quill(host, {
          theme: 'snow',
          modules: {
            toolbar: [
              [{ header: [1, 2, 3, 4, false] }],
              [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ color: [] }, { background: [] }],
              [{ script: 'sub' }, { script: 'super' }],
              [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
              [{ indent: '-1' }, { indent: '+1' }, { align: [] }],
              ['blockquote', 'code-block', 'link', 'image'],
              ['clean'],
            ],
          },
        });
        editor.clipboard.dangerouslyPasteHTML(form.body_html);
        editor.on('text-change', () => {
          form.body_html = editor.root.innerHTML;
          dirty.set(true);
        });
        const labels: Record<string, string> = {
          bold: 'Bold',
          italic: 'Italic',
          underline: 'Underline',
          strike: 'Strike',
          color: 'Color',
          background: 'Background',
          align: 'Align',
          blockquote: 'Blockquote',
          'code-block': 'Code block',
          link: 'Link',
          clean: 'Clear formatting',
          header: 'Heading',
          font: 'Font',
          size: 'Size',
          script: 'Script',
          list: 'List',
          indent: 'Indent',
        };
        host.parentElement
          ?.querySelectorAll('.ql-toolbar button,.ql-toolbar .ql-picker')
          .forEach((c) => {
            for (const key in labels)
              if (c.classList.contains('ql-' + key)) {
                c.setAttribute('aria-label', labels[key]);
                c.setAttribute('title', labels[key]);
              }
          });
        ready = true;
        dirty.set(false);
      })
      .catch((e) => {
        error = e.message;
        source = true;
      });
    return () => {
      active = false;
      dirty.set(false);
    };
  });
  function toggle() {
    if (source && editor) editor.clipboard.dangerouslyPasteHTML(form.body_html);
    source = !source;
  }
  function insert() {
    if (!converted) return;
    if (editor && !source)
      editor.insertText(
        editor.getSelection()?.index ?? editor.getLength() - 1,
        converted,
      );
    else
      form.body_html +=
        '<p>' +
        converted
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;') +
        '</p>';
    dirty.set(true);
  }
  async function submit() {
    busy = true;
    error = '';
    try {
      let result;
      if (doc) result = await send(`documents/${doc.id}`, form, 'PUT');
      else {
        const data = new FormData();
        for (const [k, v] of Object.entries(form)) data.set(k, v);
        if (file) data.set('file', file);
        result = await api('documents', { method: 'POST', body: data });
      }
      dirty.set(false);
      await invalidateAll();
      await goto('/document/' + result.id);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="editor-page">
  <span class="eyebrow">YOGILIB / CONTRIBUTE</span>
  <h1>{$t(doc ? 'Save changes' : 'Upload document')}</h1>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
    oninput={() => dirty.set(true)}
  >
    <div class="card">
      <div class="field-grid">
        {#each ['title', 'title_np'] as key}<label
            >{$t(labels[key])}<input
              bind:value={form[key]}
              required={key === 'title'}
              oninput={(e) => {
                if (key === 'title_np' && npMode === 'preeti')
                  form[key] = preetiToUnicode(e.currentTarget.value);
              }}
            /></label
          >{/each}
      </div>
      <label class="inline-label"
        >नेपाली <select bind:value={npMode}
          ><option value="unicode">Unicode</option><option value="preeti"
            >Preeti</option
          ></select
        ></label
      >
      <div class="field-grid three">
        <label
          >{$t('Category')}<select bind:value={form.category}
            >{#each categories.slice(1) as c}<option value={c}>{$t(c)}</option
              >{/each}</select
          ></label
        ><label
          >{$t('Language')}<select bind:value={form.lang}
            >{#each [['en', 'English'], ['ne', 'नेपाली'], ['sa', 'संस्कृत'], ['ne-sa', 'नेपाली + संस्कृत'], ['mixed', 'Mixed'], ['other', 'Other']] as [v, l]}<option
                value={v}>{l}</option
              >{/each}{#if !['en', 'ne', 'sa', 'ne-sa', 'mixed', 'other'].includes(form.lang)}<option
                value={form.lang}>{form.lang}</option
              >{/if}</select
          ></label
        ><label
          >{$t('Script')}<input
            bind:value={form.script}
            list="scripts"
          /><datalist id="scripts"
            ><option>देवनागरी</option><option>Latin/Roman</option><option
              >Latin IAST</option
            ><option>Mixed</option></datalist
          ></label
        >
      </div>
      <label
        >{$t('Description')}<textarea bind:value={form.description} rows="3"
        ></textarea></label
      >
      <div class="field-grid">
        {#each ['orig_author', 'orig_author_np'] as key}<label
            >{$t(labels[key])}<input
              bind:value={form[key]}
              oninput={(e) => {
                if (key === 'orig_author_np' && npMode === 'preeti')
                  form[key] = preetiToUnicode(e.currentTarget.value);
              }}
            /></label
          >{/each}
      </div>
      <div class="field-grid three">
        {#each ['orig_year', 'orig_month', 'orig_day'] as key}<label
            >{$t(labels[key])}<input bind:value={form[key]} /></label
          >{/each}
      </div>
      <p class="muted">{$t('Upload date is recorded automatically.')}</p>
    </div>
    <div class="card">
      <div class="editor-tabs">
        <button
          type="button"
          class:chosen={!source}
          onclick={() => {
            if (source) toggle();
          }}>{$t('Visual editor')}</button
        ><button
          type="button"
          class:chosen={source}
          onclick={() => {
            if (!source) toggle();
          }}>{$t('HTML source')}</button
        ><select
          class="editor-converter-toggle"
          aria-label="Script converter"
          bind:value={converterChoice}
          ><option value="">Script converter</option><option value="preeti"
            >Preeti → Unicode</option
          ><option value="itrans">ITRANS → देवनागरी</option></select
        >
      </div>
      <div
        class:hidden={source}
        lang={form.lang}
        spellcheck={form.lang === 'en'}
      >
        <div bind:this={host}></div>
      </div>
      {#if source}<label
          ><span class="sr-only">HTML source</span><textarea
            class="source-editor"
            bind:value={form.body_html}
            rows="18"
            spellcheck="false"></textarea></label
        >{/if}{#if !ready && !source}<p>{$t('Loading…')}</p>{/if}
      <div class="editor-count">{wordCount} {wordCount === 1 ? 'word' : 'words'}</div>
    </div>
    {#if converterChoice}<div class="card converter">
      <h2>{$t('Script converter')}</h2>
      <div class="field-grid">
        <label
          >{$t('Input')}<textarea bind:value={conversion} rows="5"
          ></textarea></label
        ><label
          >{$t('Unicode')}<textarea value={converted} readonly rows="5"
          ></textarea></label
        >
      </div>
      <button type="button" onclick={insert}>{$t('Insert into editor')}</button>
    </div>{/if}
    {#if !doc}<div class="card">
        <label
          >{$t('Original file')}<input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onchange={(e) => (file = e.currentTarget.files?.[0] || null)}
          /></label
        >
        <p class="muted">PDF, PNG, JPEG, WebP · 50 MB</p>
      </div>{/if}{#if error}<p class="error" role="alert">{$t(error)}</p>{/if}
    <div class="form-actions">
      <a class="button" href={doc ? '/document/' + doc.id : '/'}
        >{$t('Cancel')}</a
      ><button class="primary" disabled={busy}
        >{$t(doc ? 'Save changes' : 'Upload document')}</button
      >
    </div>
  </form>
</section>
