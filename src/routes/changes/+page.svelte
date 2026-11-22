<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { locale, t } from '$lib/i18n';
  import { api } from '$lib/client/api';
  let { data } = $props();
  const admin = $derived($page.data.session?.user?.role === 'admin');
  let busy = $state('');
  let message = $state('');
  let integrity = $state<{
    ok: boolean;
    count: number;
    head: string;
    brokenAt?: string;
  } | null>(null);
  const labels: Record<string, string> = {
    create: 'Added',
    edit: 'Edited',
    restore: 'Restored an earlier version',
    delete: 'Deleted',
    recover: 'Recovered',
  };
  function when(at: string) {
    try {
      return new Date(at).toLocaleString($locale === 'ne' ? 'ne-NP' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return at;
    }
  }
  async function verify() {
    busy = 'verify';
    message = '';
    try {
      integrity = await api('journal/verify');
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = '';
    }
  }
  async function recover(seq: string, id: string) {
    busy = seq;
    message = '';
    try {
      await api(`journal/${seq}/recover`, { method: 'POST', body: '{}' });
      await goto(`/document/${id}`);
    } catch (e) {
      message = (e as Error).message;
      await invalidateAll();
    } finally {
      busy = '';
    }
  }
  const last = $derived(data.changes.at(-1));
</script>

<svelte:head><title>{$t('Recent changes')} · Yogilib</title></svelte:head>
<section class="archive">
  <div class="section-heading">
    <div>
      <span class="eyebrow">YOGILIB / JOURNAL</span>
      <h1>{$t('Recent changes')}</h1>
    </div>
    {#if admin && data.enabled}<button
        class="quiet"
        disabled={busy === 'verify'}
        onclick={verify}>{$t('Verify journal')}</button
      >{/if}
  </div>
  <p class="journal-intro">
    {$t(
      'Every change to the archive is written to a permanent, tamper-evident journal. Deleted works keep their last text so they can be recovered.',
    )}
  </p>
  {#if integrity}<p class={integrity.ok ? 'journal-ok' : 'error'} role="status">
      {integrity.ok
        ? `${$t('Journal intact')} · ${integrity.count} · ${integrity.head.slice(0, 12)}`
        : `${$t('Journal broken at entry')} ${integrity.brokenAt}`}
    </p>{/if}
  {#if message}<p class="error" role="alert">{$t(message)}</p>{/if}
  {#if !data.enabled}<p class="empty">
      {$t('The journal is not enabled on this archive yet.')}
    </p>
  {:else}
    <ol class="journal">
      {#each data.changes as c (c.seq)}<li class={'journal-' + c.action}>
          <span class="journal-seq">#{c.seq}</span>
          <span class="journal-action">{$t(labels[c.action] || c.action)}</span>
          <span class="journal-title"
            >{#if c.action === 'delete'}{c.title_np || c.title}{:else}<a
                href={`/document/${c.document_id}`}>{c.title_np || c.title}</a
              >{/if}{#if c.title_np && c.title}<small>{c.title}</small
              >{/if}</span
          >
          <time datetime={c.at}>{when(c.at)}</time>
          {#if admin && c.recoverable}<button
              class="quiet"
              disabled={busy === c.seq}
              onclick={() => recover(c.seq, c.document_id)}
              >{$t('Recover')}</button
            >{/if}
        </li>{:else}<p class="empty">{$t('No changes recorded yet.')}</p>{/each}
    </ol>
    <div class="pager">
      {#if data.changes.length === 50 && last}<a
          class="button"
          href={`/changes?before=${last.seq}`}>{$t('Older changes')}</a
        >{/if}
    </div>
  {/if}
</section>
