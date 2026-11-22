import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { toApiFailure } from './api-error';
import type {
  Education,
  Experience,
  Language,
  Profile,
  ProfileBundle,
  Project,
  Skill,
  PublicPortfolio,
} from './models';

/** Score de complétude calculé côté serveur, affiché sur le tableau de bord. */
export interface CompletenessCheck {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

export interface Completeness {
  score: number;
  checks: CompletenessCheck[];
}

export interface ProfilePayload extends Partial<Omit<Profile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> {}

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/me/profile';

  /* ── Profil ── */

  get(): Observable<ProfileBundle & { completeness: Completeness }> {
    return this.http
      .get<{ data: ProfileBundle & { completeness: Completeness } }>(this.base)
      .pipe(map((res) => res.data), this.fail());
  }

  update(payload: ProfilePayload): Observable<Profile> {
    return this.http
      .patch<{ data: { profile: Profile } }>(this.base, payload)
      .pipe(
        map((res) => res.data.profile),
        this.fail(),
      );
  }

  /* ── Compétences ── */

  createSkill(payload: Partial<Skill>): Observable<Skill> {
    return this.http
      .post<{ data: Skill }>(`${this.base}/skills`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  updateSkill(id: string, payload: Partial<Skill>): Observable<Skill> {
    return this.http
      .patch<{ data: Skill }>(`${this.base}/skills/${id}`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  deleteSkill(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/skills/${id}`).pipe(this.fail());
  }

  reorderSkills(ids: string[]): Observable<void> {
    return this.http.put<void>(`${this.base}/skills/order`, { ids }).pipe(this.fail());
  }

  /* ── Projets ── */

  createProject(payload: Partial<Project>): Observable<Project> {
    return this.http
      .post<{ data: Project }>(`${this.base}/projects`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  updateProject(id: string, payload: Partial<Project>): Observable<Project> {
    return this.http
      .patch<{ data: Project }>(`${this.base}/projects/${id}`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/projects/${id}`).pipe(this.fail());
  }

  reorderProjects(ids: string[]): Observable<void> {
    return this.http.put<void>(`${this.base}/projects/order`, { ids }).pipe(this.fail());
  }

  /* ── Expériences ── */

  createExperience(payload: Partial<Experience>): Observable<Experience> {
    return this.http
      .post<{ data: Experience }>(`${this.base}/experiences`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  updateExperience(id: string, payload: Partial<Experience>): Observable<Experience> {
    return this.http
      .patch<{ data: Experience }>(`${this.base}/experiences/${id}`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  deleteExperience(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/experiences/${id}`).pipe(this.fail());
  }

  reorderExperiences(ids: string[]): Observable<void> {
    return this.http.put<void>(`${this.base}/experiences/order`, { ids }).pipe(this.fail());
  }

  /* ── Formations ── */

  createEducation(payload: Partial<Education>): Observable<Education> {
    return this.http
      .post<{ data: Education }>(`${this.base}/educations`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  updateEducation(id: string, payload: Partial<Education>): Observable<Education> {
    return this.http
      .patch<{ data: Education }>(`${this.base}/educations/${id}`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  deleteEducation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/educations/${id}`).pipe(this.fail());
  }

  /* ── Langues ── */

  createLanguage(payload: Partial<Language>): Observable<Language> {
    return this.http
      .post<{ data: Language }>(`${this.base}/languages`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  updateLanguage(id: string, payload: Partial<Language>): Observable<Language> {
    return this.http
      .patch<{ data: Language }>(`${this.base}/languages/${id}`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  deleteLanguage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/languages/${id}`).pipe(this.fail());
  }

  /* ── Portfolio public ── */

  getPublic(slug: string): Observable<PublicPortfolio> {
    return this.http
      .get<{ data: PublicPortfolio }>(`/api/portfolio/${slug}`)
      .pipe(map((res) => res.data), this.fail());
  }

  listPublicSlugs(): Observable<string[]> {
    return this.http
      .get<{ data: string[] | { items: string[] } }>('/api/portfolio/slugs/list')
      .pipe(
        map((res) => (Array.isArray(res.data) ? res.data : res.data.items)),
        this.fail(),
      );
  }

  private fail<T>() {
    return catchError<T, Observable<never>>((error) => throwError(() => toApiFailure(error)));
  }
}
