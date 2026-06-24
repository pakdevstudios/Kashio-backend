import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CouriersService } from './couriers.service';
import { CreateCourierDto } from './dto/create-courier.dto';
import { CourierQueryDto } from './dto/courier-query.dto';
import { AssignRiderDto } from './dto/assign-rider.dto';
import {
  CancelCourierDto,
  UpdateStatusDto,
} from './dto/update-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('couriers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  // POST /v1/couriers — book a courier (customer from the app, or admin)
  @Post()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  create(@Body() dto: CreateCourierDto, @CurrentUser() user: AuthUser) {
    const customerId = user.role === Role.CUSTOMER ? user.id : undefined;
    return this.couriersService.create(dto, customerId);
  }

  // GET /v1/couriers — admin list with ?status= &riderId= &search=
  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query() query: CourierQueryDto) {
    return this.couriersService.findAll(query);
  }

  // GET /v1/couriers/mine — the logged-in customer's own bookings
  @Get('mine')
  @Roles(Role.CUSTOMER)
  findMine(@CurrentUser() user: AuthUser) {
    return this.couriersService.findForCustomer(user.id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RIDER)
  findOne(@Param('id') id: string) {
    return this.couriersService.findOne(id);
  }

  // GET /v1/couriers/:id/track — tracking timeline
  @Get(':id/track')
  @Roles(Role.ADMIN, Role.RIDER, Role.CUSTOMER)
  track(@Param('id') id: string) {
    return this.couriersService.track(id);
  }

  // POST /v1/couriers/:id/assign — admin assigns a rider
  @Post(':id/assign')
  @Roles(Role.ADMIN)
  assign(@Param('id') id: string, @Body() dto: AssignRiderDto) {
    return this.couriersService.assignRider(id, dto.riderId);
  }

  // POST /v1/couriers/:id/accept — rider accepts the assignment
  @Post(':id/accept')
  @Roles(Role.RIDER)
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.couriersService.acceptByRider(id, user);
  }

  // POST /v1/couriers/:id/decline — rider declines -> back to pending
  @Post(':id/decline')
  @Roles(Role.RIDER)
  decline(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.couriersService.declineByRider(id, user);
  }

  // PATCH /v1/couriers/:id/status — advance status (admin or assigned rider)
  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.RIDER)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.couriersService.updateStatus(id, dto.status, dto.note, user);
  }

  // POST /v1/couriers/:id/cancel — admin cancels any booking; customer cancels own
  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.CUSTOMER)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelCourierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.couriersService.cancel(id, dto.reason, user);
  }
}
