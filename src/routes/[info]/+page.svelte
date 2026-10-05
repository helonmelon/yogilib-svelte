<script lang="ts">
  import { t } from '$lib/i18n';
  let { data } = $props();
</script>

<svelte:head><title>{$t(data.title)} · Yogilib</title></svelte:head>
<section class="prose">
  {@html data.html}{#if data.kind === 'store'}<p>
      {$t('No items yet. Check back soon.')}
    </p>{/if}
</section>
