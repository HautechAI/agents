import { Controller, Get, Inject, Param, Post, Put, Body, Delete, Headers, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { VariablesService } from './variables.service';
import { CreateVariableBodySchema } from './dto/createVariable.dto';
import { UpdateVariableBodySchema } from './dto/updateVariable.dto';
import { variableKeySchema } from './variables.types';

@Controller('api/graphs/:name/variables')
export class VariablesController {
  constructor(@Inject(VariablesService) private readonly variables: VariablesService) {}

  @Get()
  async list(@Param('name') name: string) {
    return await this.variables.getVariables(name);
  }

  @Post()
  async create(@Param('name') name: string, @Body() body: unknown, @Headers('x-graph-version') versionHeader?: string) {
    const parsed = CreateVariableBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'INVALID_BODY', details: parsed.error.flatten() }, 400);
    }
    const expectedVersion = parseExpectedVersion(versionHeader);
    await this.variables.createVariable(name, { key: parsed.data.key, source: parsed.data.source, value: (parsed.data as any).value, vaultRef: (parsed.data as any).vaultRef }, expectedVersion);
    return { ok: true };
  }

  @Put(':key')
  async update(@Param('name') name: string, @Param('key') key: string, @Body() body: unknown, @Headers('x-graph-version') versionHeader?: string) {
    const parsed = UpdateVariableBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'INVALID_BODY', details: parsed.error.flatten() }, 400);
    }
    const expectedVersion = parseExpectedVersion(versionHeader);
    await this.variables.updateVariable(name, key, { key, source: parsed.data.source, value: (parsed.data as any).value, vaultRef: (parsed.data as any).vaultRef }, expectedVersion);
    return { ok: true };
  }

  @Delete(':key')
  async remove(@Param('name') name: string, @Param('key') key: string, @Headers('x-graph-version') versionHeader?: string) {
    const expectedVersion = parseExpectedVersion(versionHeader);
    await this.variables.deleteVariable(name, key, expectedVersion);
    return { ok: true };
  }
}

function parseExpectedVersion(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
