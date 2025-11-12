import { Module, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { MongoService } from '../core/services/mongo.service';
import { ContainerService } from '../infra/container/container.service';
import { InfraModule } from '../infra/infra.module';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';

import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { AgentsRemindersController } from '../agents/reminders.controller';
import { AgentsThreadsController } from '../agents/threads.controller';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { EnvModule } from '../env/env.module';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { GraphEventsPublisher } from '../gateway/graph.events.publisher';
import { SlackAdapter } from '../messaging/slack/slack.adapter';
import { buildTemplateRegistry } from '../templates';
import { GraphController } from './controllers/graph.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { GraphVariablesController } from './controllers/graphVariables.controller';
import { MemoryController } from './controllers/memory.controller';
import { RunsController } from './controllers/runs.controller';
import { GitGraphRepository } from './gitGraph.repository';
import { GraphGuard } from './graph.guard';
import { GraphRepository } from './graph.repository';
import { MongoGraphRepository } from './graphMongo.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { NodeStateService } from './nodeState.service';
import { PortsRegistry } from './ports.registry';
import { GraphVariablesService } from './services/graphVariables.service';
import { TemplateRegistry } from './templateRegistry';
import { NodesModule } from '../nodes/nodes.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [CoreModule, InfraModule, EnvModule, EventsModule, forwardRef(() => NodesModule)],
  controllers: [
    RunsController,
    GraphPersistController,
    GraphController,
    MemoryController,
    GraphVariablesController,
    AgentsThreadsController,
    AgentsRemindersController,
  ],
  providers: [
    {
      provide: GraphGuard,
      useClass: GraphGuard,
    },
    TemplateRegistry,
    {
      provide: TemplateRegistry,
      useFactory: (
        logger: LoggerService,
        containerService: ContainerService,
        configService: ConfigService,
        mongoService: MongoService,
        ncpsKeyService: NcpsKeyService,
        module: ModuleRef,
      ) =>
        buildTemplateRegistry({
          logger,
          containerService,
          configService,
          mongoService,
          ncpsKeyService,
          moduleRef: module,
        }),
      inject: [LoggerService, ContainerService, ConfigService, MongoService, NcpsKeyService, ModuleRef],
    },
    PortsRegistry,
    {
      provide: GraphRepository,
      useFactory: async (
        config: ConfigService,
        logger: LoggerService,
        mongo: MongoService,
        templateRegistry: TemplateRegistry,
      ) => {
        if (config.graphStore === 'git') {
          const svc = new GitGraphRepository(config, logger, templateRegistry);
          await svc.initIfNeeded();
          return svc;
        } else {
          const svc = new MongoGraphRepository(mongo.getDb(), logger, templateRegistry, config);
          await svc.initIfNeeded();
          return svc;
        }
      },
      inject: [ConfigService, LoggerService, MongoService, TemplateRegistry],
    },
    LiveGraphRuntime,
    NodeStateService,
    // Gateway and publisher binding
    GraphSocketGateway,
    {
      provide: GraphEventsPublisher,
      useExisting: GraphSocketGateway,
    },
    // Centralized threads metrics aggregator
    ThreadsMetricsService,
    AgentsPersistenceService,
    // Messaging adapters
    SlackAdapter,
    // PrismaService is injected by type; no string token aliasing required
    // Standard DI for GraphVariablesService
    GraphVariablesService,
  ],
  exports: [
    LiveGraphRuntime,
    TemplateRegistry,
    PortsRegistry,
    GraphRepository,
    NodeStateService,
    ThreadsMetricsService,
    AgentsPersistenceService,
    GraphEventsPublisher,
  ],
})
export class GraphModule {}
