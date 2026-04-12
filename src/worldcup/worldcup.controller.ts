import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { parseSessionUserFromCookie, parseSessionUserFromTransport } from '../auth/session-user.util';
import { WorldcupService } from './worldcup.service';

@Controller('api')
export class WorldcupController {
  private readonly logger = new Logger(WorldcupController.name);

  constructor(private readonly worldcupService: WorldcupService) {}

  private getSessionUser(req: Request): { discordId: string; username: string; avatar: string } {
    const cookieUser = parseSessionUserFromCookie(req.cookies?.['penca-session']);

    if (cookieUser) {
      return cookieUser;
    }

    const headerUser = parseSessionUserFromTransport(req.get('x-penca-session'));

    if (headerUser) {
      return headerUser;
    }

    throw new UnauthorizedException('Debes iniciar sesion para continuar.');
  }

  @Get('predictions/me')
  async getMyPrediction(@Req() req: Request) {
    const sessionUser = this.getSessionUser(req);
    const prediction = await this.worldcupService.getPredictionByDiscordId(sessionUser.discordId);

    return {
      prediction,
    };
  }

  @Put('predictions/draft')
  async saveDraftPrediction(@Req() req: Request, @Body() body: unknown) {
    const sessionUser = this.getSessionUser(req);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payload invalido.');
    }

    this.logger.debug(
      `saveDraftPrediction incoming ${JSON.stringify({
        discordId: sessionUser.discordId,
        username: sessionUser.username,
        avatar: sessionUser.avatar,
        body,
      })}`,
    );

    const saved = await this.worldcupService.saveDraftPrediction({
      discordId: sessionUser.discordId,
      username: sessionUser.username,
      avatar: sessionUser.avatar,
      payload: body as Record<string, unknown>,
    });

    return {
      message: 'Borrador guardado correctamente.',
      prediction: saved,
    };
  }

  @Post('predictions')
  async savePrediction(@Req() req: Request, @Body() body: unknown) {
    const sessionUser = this.getSessionUser(req);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payload invalido.');
    }

    this.logger.debug(
      `savePrediction incoming ${JSON.stringify({
        discordId: sessionUser.discordId,
        username: sessionUser.username,
        avatar: sessionUser.avatar,
        body,
      })}`,
    );

    const saved = await this.worldcupService.savePrediction({
      discordId: sessionUser.discordId,
      username: sessionUser.username,
      avatar: sessionUser.avatar,
      payload: body as Record<string, unknown>,
    });

    return {
      message: 'Prediccion guardada correctamente.',
      prediction: saved,
    };
  }

  @Get('predictions')
  async getPredictions() {
    const predictions = await this.worldcupService.getPredictions();

    return {
      predictions,
    };
  }

  @Get('official-results')
  async getOfficialResults() {
    const officialResults = await this.worldcupService.getOfficialResults();

    return {
      officialResults,
    };
  }

  @Put('official-results')
  async saveOfficialResults(@Req() req: Request, @Body() body: unknown) {
    const sessionUser = this.getSessionUser(req);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payload invalido.');
    }

    const officialResults = await this.worldcupService.saveOfficialResults({
      discordId: sessionUser.discordId,
      payload: body as Record<string, unknown>,
    });

    return {
      message: 'Resultados oficiales guardados correctamente.',
      officialResults,
    };
  }

  @Get('dashboard')
  getDashboard() {
    return this.worldcupService.getDashboard();
  }

  @Get('users')
  getUsers() {
    return this.worldcupService.getUsers();
  }

  @Get('users/:discordId')
  getUserByDiscordId(@Param('discordId') discordId: string) {
    return this.worldcupService.getUserByDiscordId(discordId);
  }

  @Get('countries')
  getCountries() {
    return this.worldcupService.getCountries();
  }

  @Get('countries/:code')
  getCountryByCode(@Param('code') code: string) {
    return this.worldcupService.getCountryByCode(code);
  }

  @Get('matches')
  getMatches() {
    return this.worldcupService.getMatches();
  }

  @Get('matches/:id')
  getMatchById(@Param('id') id: string) {
    return this.worldcupService.getMatchById(id);
  }
}