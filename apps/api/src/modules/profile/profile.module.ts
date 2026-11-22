import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Education,
  Experience,
  ExperienceSkill,
  Language_,
  ProfessionalProfile,
  Project,
  ProjectSkill,
  Skill,
} from '../../database/entities/profile.entity';
import { ProfileService } from './profile.service';
import { ProfileController, PublicPortfolioController } from './profile.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfessionalProfile,
      Skill,
      Project,
      ProjectSkill,
      Experience,
      ExperienceSkill,
      Education,
      Language_,
    ]),
  ],
  controllers: [ProfileController, PublicPortfolioController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
