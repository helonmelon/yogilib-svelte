<script lang="ts">
  import { onMount } from 'svelte';
  import { t, locale } from '$lib/i18n';
  import { api, send } from '$lib/client/api';
  import type { User } from '$lib/types';
  let { docId, user, passage = '' }: { docId: string; user: User | null; passage?: string } = $props();
  let enabled = $state(false);
  let question = $state('');
  let answer = $state('');
  let error = $state('');
  let busy = $state(false);
  let remaining = $state<number | null>(null);
  onMount(async () => {
    try {
      enabled = (await api<{ enabled: boolean }>('ai/status')).enabled;
    } catch {}
  });
  async function ask(kind: 'summary' | 'explain' | 'ask') {
    busy = true;
    error = '';
    answer = '';
    try {
      const r = await send(`documents/${docId}/ai`, {
        kind,
        text: kind === 'explain' ? passage : kind === 'ask' ? question : '',
        lang: $locale,
      });
      remaining = r.remaining;
      answer = r.refused ? $t('The AI declined to answer this request.') : r.answer;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if enabled}<section class="ai-companion" aria-labelledby="ai-heading">
    <h2 id="ai-heading">{$t('Reading companion')} <span class="ai-badge">AI</span></h2>
    {#if user}<p class="muted">
        {$t('Ask about this document. Answers are AI-generated readings — always check them against the original text.')}
      </p>
      <div class="ai-actions">
        <button disabled={busy} onclick={() => ask('summary')}>{$t('Summarise')}</button>
        <button disabled={busy || !passage.trim()} onclick={() => ask('explain')}
          >{$t('Explain selected passage')}</button
        >
      </div>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          if (question.trim()) ask('ask');
        }}
      >
        <label
          >{$t('Your question')}<input
            bind:value={question}
            maxlength="4000"
            placeholder={$t('Who wrote this, and why?')}
          /></label
        ><button class="primary" disabled={busy || !question.trim()}>{$t('Ask')}</button>
      </form>
      {#if busy}<p aria-live="polite">{$t('Reading the document…')}</p>{/if}
      {#if error}<p class="error" role="alert">{$t(error)}</p>{/if}
      {#if answer}<div class="ai-answer" aria-live="polite">
          <p>{answer}</p>
          <small>{$t('AI-generated')}{remaining !== null ? ` · ${remaining} ${$t('left today')}` : ''}</small>
        </div>{/if}
    {:else}<p><a href="/join">{$t('Create a free reader account')}</a> {$t('to use the AI reading companion.')}</p>{/if}
  </section>{/if}
