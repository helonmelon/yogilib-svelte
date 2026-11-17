<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  import { send } from '$lib/client/api';
  let status = $state<'checking' | 'pending' | 'completed' | 'failed' | 'error'>('checking');
  let detail = $state<{ amount?: number; currency?: string }>({});
  async function check(attempt = 0) {
    try {
      const r = await send(`payments/${$page.params.ref}/verify`, {});
      detail = r;
      status = r.status;
      if (r.status === 'pending' && attempt < 5) setTimeout(() => check(attempt + 1), 3000);
    } catch {
      status = 'error';
    }
  }
  onMount(() => check());
</script>

<svelte:head><title>{$t('Contribution')} · Yogilib</title></svelte:head>
<section class="card welcome" aria-live="polite">
  {#if status === 'checking'}<h1>{$t('Confirming your contribution…')}</h1>
  {:else if status === 'completed'}<h1>{$t('Thank you')}</h1>
    <p>{$t('Your contribution of')} {detail.currency} {detail.amount} {$t('was received. It helps keep this archive open for everyone.')}</p>
  {:else if status === 'pending'}<h1>{$t('Still confirming')}</h1>
    <p>{$t('The payment provider has not confirmed this yet. If money left your account it will be confirmed shortly.')}</p>
  {:else}<h1>{$t('Payment not completed')}</h1>
    <p>{$t('No contribution was recorded. You can try again.')}</p>{/if}
  <p><a href="/support">{$t('Support Yogilib')}</a> · <a href="/">{$t('Archive')}</a></p>
</section>
