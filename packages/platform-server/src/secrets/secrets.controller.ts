import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { VaultService } from '../vault/vault.service';
import { SecretsService } from './secrets.service';
import { SummaryQueryDto } from './dto/summary.query.dto';
import { ReadQueryDto } from './dto/read.query.dto';
import { LoggerService } from '../core/services/logger.service';

@Controller('api/secrets')
export class SecretsController {
  constructor(
    @Inject(SecretsService) private readonly secrets: SecretsService,
    @Inject(VaultService) private readonly vault: VaultService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  @Get('summary')
  async getSummary(@Query() q: SummaryQueryDto) {
    // Parse numbers safely without redundant casts; default to sane values
    const pageNumRaw = typeof q.page === 'string' ? Number(q.page) : NaN;
    const pageSizeRaw = typeof q.page_size === 'string' ? Number(q.page_size) : NaN;
    const pageNum = Number.isFinite(pageNumRaw) && pageNumRaw > 0 ? pageNumRaw : 1;
    const pageSizeNum = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : 50;
    return this.secrets.summarize({
      filter: q.filter ?? 'all',
      page: pageNum,
      pageSize: pageSizeNum,
      mount: q.mount,
      pathPrefix: q.path_prefix,
    });
  }

  // Wildcard to allow slashes in :path
  @Get(':mount/*path/:key')
  async readSecret(
    @Param('mount') mount: string,
    @Param('path') path: string,
    @Param('key') key: string,
    @Query() q: ReadQueryDto,
  ): Promise<{ ref: string; masked: boolean; value?: string; length?: number; status: 'present' | 'missing' | 'error'; error?: string }> {
    const ref = `${mount}/${path}/${key}`;
    const reveal = q?.reveal;
    const wantReveal = reveal === '1' || (reveal || '').toLowerCase() === 'true';
    if (wantReveal) {
      try {
        const v = await this.vault.getSecret({ mount, path, key });
        if (v == null) return { ref, masked: false, status: 'missing' };
        // Do NOT log plaintext
        return { ref, masked: false, status: 'present', value: v };
      } catch (e: unknown) {
        // Log non-sensitive error code; avoid secret value logging
        const msg = e instanceof Error ? e.message : String(e);
        this.logger?.debug?.('SecretsController: reveal read failed for %s: %s', ref, msg);
        return { ref, masked: false, status: 'error', error: 'vault_error' };
      }
    }
    try {
      const v = await this.vault.getSecret({ mount, path, key });
      if (v == null) return { ref, masked: false, status: 'missing' };
      return { ref, masked: true, status: 'present', length: String(v).length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger?.debug?.('SecretsController: masked read failed for %s: %s', ref, msg);
      return { ref, masked: false, status: 'error', error: 'vault_error' };
    }
  }
}

// Note: No admin-token gating; reveal is allowed when explicitly requested.
