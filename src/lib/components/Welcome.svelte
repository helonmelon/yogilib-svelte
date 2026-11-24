<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  let { user = null }: { user?: { role: string } | null } = $props();
  const KEY = 'yogilib-welcomed';
  let open = $state(false);
  onMount(() => {
    try {
      open = !localStorage.getItem(KEY);
    } catch {
      open = false;
    }
  });
  function dismiss() {
    open = false;
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {}
  }
  const steps = $derived([
    {
      mark: '१',
      title: 'Read freely',
      text: 'Every work in the archive is open to read, in its original language and script.',
    },
    {
      mark: '२',
      title: 'Search in any script',
      text: 'Search titles and passages in Nepali, Sanskrit or English, or browse by category.',
    },
    user
      ? {
          mark: '३',
          title:
            user.role === 'viewer'
              ? 'Keep private notes'
              : 'Add to the archive',
          text:
            user.role === 'viewer'
              ? 'Select a passage while reading to keep a private note. Your place is remembered on every device.'
              : 'Use Upload to add a work. Every change is kept in the archive’s permanent history.',
        }
      : {
          mark: '३',
          title: 'Sign in to keep notes',
          text: 'Signed-in readers keep private notes and pick up where they left off on any device.',
        },
  ]);
</script>

{#if open}<section class="welcome" aria-labelledby="welcome-title">
    <div class="welcome-head">
      <div>
        <span class="eyebrow">{$t('Welcome to Yogilib')}</span>
        <h2 id="welcome-title">
          {$t('A living time capsule of Yogi Narharinath’s works')}
        </h2>
      </div>
      <button class="quiet" onclick={dismiss} aria-label={$t('Close')}>✕</button
      >
    </div>
    <ol class="welcome-steps">
      {#each steps as s}<li>
          <span class="welcome-mark" aria-hidden="true">{s.mark}</span>
          <div>
            <strong>{$t(s.title)}</strong>
            <p>{$t(s.text)}</p>
          </div>
        </li>{/each}
    </ol>
    <div class="welcome-actions">
      {#if !user}<a class="button" href="/login">{$t('Login')}</a>{/if}
      <button class="primary" onclick={dismiss}>{$t('Start reading')}</button>
    </div>
  </section>{/if}
