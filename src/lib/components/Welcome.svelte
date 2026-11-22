<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  // Shown once to first-time visitors; remembered on this device only.
  const KEY = 'yogilib-welcomed';
  let open = $state(false);
  const user = $derived($page.data.session?.user);
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
</script>

{#if open}<aside class="welcome" aria-labelledby="welcome-title">
    <div class="welcome-head">
      <span class="eyebrow">{$t('Welcome')} · स्वागतम्</span>
      <h2 id="welcome-title">{$t('A library kept for the next generation')}</h2>
      <p>
        {$t(
          "Yogi Naraharinath's works and Nepal's historical record, preserved as they were written.",
        )}
      </p>
    </div>
    <ol class="welcome-steps">
      <li>
        <strong>{$t('Search')}</strong>
        <span>{$t('Find titles and passages in English or Nepali.')}</span>
      </li>
      <li>
        <strong>{$t('Read')}</strong>
        <span
          >{$t(
            'Switch the interface language above. Original texts are never translated.',
          )}</span
        >
      </li>
      <li>
        <strong>{$t('Keep')}</strong>
        <span
          >{$t(
            'Sign in to save private notes and your reading place on every device.',
          )}</span
        >
      </li>
    </ol>
    <div class="welcome-actions">
      <button class="primary" onclick={dismiss}>{$t('Start exploring')}</button>
      {#if !user}<a class="button" href="/login" onclick={dismiss}
          >{$t('Sign in')}</a
        >{/if}
      <a class="quiet-link" href="/changes" onclick={dismiss}
        >{$t('Recent changes')}</a
      >
    </div>
  </aside>{/if}
