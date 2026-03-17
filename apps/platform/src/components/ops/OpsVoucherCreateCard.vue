<template>
  <Card>
    <CardHeader>
      <CardTitle>Vouchers</CardTitle>
      <CardDescription v-if="!wallet">
        Connect your wallet to create voucher tokens.
      </CardDescription>
    </CardHeader>
    <CardContent v-if="wallet">
      <div class="space-y-4">
        <div class="space-y-2">
          <p class="text-muted-foreground text-sm font-medium">Step 1: Create mint</p>
          <Button
            size="sm"
            variant="default"
            :disabled="loading"
            @click="$emit('create-mint')"
          >
            {{ loading ? 'Creating…' : 'Create mint (0 decimals)' }}
          </Button>
        </div>
        <div class="space-y-2">
          <p class="text-muted-foreground text-sm font-medium">Or add existing mint as draft</p>
          <p class="text-muted-foreground text-xs">
            Paste a mint address to treat it as a draft: link to entitlement, edit metadata, then use it (e.g. reuse tokens from testing).
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Input
              v-model="existingMintValue"
              placeholder="Mint address (base58)"
              class="font-mono text-sm max-w-[320px]"
              :disabled="loading"
            />
            <Button
              size="sm"
              variant="secondary"
              :disabled="loading || !existingMintValue.trim()"
              @click="$emit('add-draft', existingMintValue.trim())"
            >
              {{ loading ? 'Adding…' : 'Add as draft' }}
            </Button>
          </div>
        </div>
        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        <p v-if="success" class="text-muted-foreground text-sm">{{ success }}</p>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

const props = defineProps<{
  wallet: string | null
  loading: boolean
  error: string | null
  success: string | null
  existingMint?: string
}>()

const emit = defineEmits<{ 'create-mint': []; 'add-draft': [mint: string]; 'update:existingMint': [value: string] }>()

const existingMintValue = computed({
  get: () => props.existingMint ?? '',
  set: (v: string) => emit('update:existingMint', v),
})
</script>
