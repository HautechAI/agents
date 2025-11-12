import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { GraphEventsPublisher, NoopGraphEventsPublisher } from '../gateway/graph.events.publisher';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [CoreModule],
  providers: [RunEventsService, { provide: GraphEventsPublisher, useClass: NoopGraphEventsPublisher }],
  exports: [RunEventsService, GraphEventsPublisher],
})
export class EventsModule {}
