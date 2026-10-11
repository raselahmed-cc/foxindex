import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './chat.repository';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [TicketsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatGateway],
  // AdminModule moves a client's conversation when they are reassigned to another manager.
  exports: [ChatRepository],
})
export class ChatModule {}
