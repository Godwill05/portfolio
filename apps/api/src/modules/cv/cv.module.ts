import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cv, CvTemplate } from '../../database/entities/cv.entity';
import {
  Education,
  Experience,
  Language_,
  ProfessionalProfile,
  Project,
  Skill,
} from '../../database/entities/profile.entity';
import { CvService } from './cv.service';
import { CvBuilderService } from './cv-builder.service';
import { CvController } from './cv.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cv,
      CvTemplate,
      ProfessionalProfile,
      Skill,
      Project,
      Experience,
      Education,
      Language_,
    ]),
  ],
  controllers: [CvController],
  providers: [CvService, CvBuilderService],
  exports: [CvService, CvBuilderService],
})
export class CvModule {}
