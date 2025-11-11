import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { ConfigService } from '../src/core/services/config.service';

describe('AgentsThreadsController PATCH threads/:id', () => {
  it('accepts null summary and toggles status', async () => {
    const updates: any[] = [];
    const terminate = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: AgentsPersistenceService,
          useValue: {
            updateThread: async (id: string, data: any) => {
              updates.push({ id, data });
              return { previousStatus: 'open', status: data.status ?? 'open' };
            },
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
        {
          provide: ContainerThreadTerminationService,
          useValue: { terminateByThread: terminate },
        },
        {
          provide: ConfigService,
          useValue: { threadCloseTerminateEnabled: false },
        },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('t1', { summary: null });
    await ctrl.patchThread('t2', { status: 'closed' });

    expect(updates).toEqual([
      { id: 't1', data: { summary: null } },
      { id: 't2', data: { status: 'closed' } },
    ]);
    expect(terminate).not.toHaveBeenCalled();
  });

  it('invokes container termination when closing a thread and flag enabled', async () => {
    const terminate = vi.fn();
    const updateThread = vi.fn(async () => ({ previousStatus: 'open', status: 'closed' }));
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: AgentsPersistenceService,
          useValue: {
            updateThread,
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: terminate } },
        { provide: ConfigService, useValue: { threadCloseTerminateEnabled: true } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('closed-thread', { status: 'closed' });

    expect(updateThread).toHaveBeenCalledWith('closed-thread', { status: 'closed' });
    expect(terminate).toHaveBeenCalledWith('closed-thread', { synchronous: false });
  });

  it('does not invoke termination when status already closed', async () => {
    const terminate = vi.fn();
    const updateThread = vi.fn(async () => ({ previousStatus: 'closed', status: 'closed' }));
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: AgentsPersistenceService,
          useValue: {
            updateThread,
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: terminate } },
        { provide: ConfigService, useValue: { threadCloseTerminateEnabled: true } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('already-closed', { status: 'closed' });

    expect(terminate).not.toHaveBeenCalled();
  });
});
