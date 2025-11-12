import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [CoreModule],
  providers: [RunEventsService],
  exports: [RunEventsService],
})
export class EventsModule {}
