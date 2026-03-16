<template>
  <Card>
    <CardHeader>
      <CardTitle>Vouchers</CardTitle>
      <CardDescription v-if="!wallet">
        Connect your wallet to create voucher tokens.
      </CardDescription>
    </CardHeader>
    <CardContent v-if="wallet">
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
        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        <p v-if="success" class="text-muted-foreground text-sm">{{ success }}</p>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

defineProps<{
  wallet: string | null
  loading: boolean
  error: string | null
  success: string | null
}>()

defineEmits<{ 'create-mint': [] }>()
</script>
