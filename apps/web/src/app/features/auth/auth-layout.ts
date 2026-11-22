import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <div class="shell">
      <!-- Colonne narrative : masquée sur mobile, elle porte l'identité. -->
      <aside class="aside">
        <div class="aside__inner">
          <a class="brand" href="/">
            <span class="brand__mark" aria-hidden="true">F</span>
            <span class="brand__name">FolioForge</span>
          </a>

          <div class="pitch">
            <h1 class="pitch__title">Votre parcours mérite mieux qu’un fichier Word.</h1>
            <p class="pitch__text">
              Portfolio public, CV générés, analyse d’offres et assistant de carrière —
              réunis dans un seul espace.
            </p>
          </div>

          <ul class="points">
            <li>
              <span class="points__dot" aria-hidden="true"></span>
              12 modèles de CV, export PDF instantané
            </li>
            <li>
              <span class="points__dot" aria-hidden="true"></span>
              Un portfolio en ligne, à votre nom
            </li>
            <li>
              <span class="points__dot" aria-hidden="true"></span>
              Assistant IA qui s’appuie sur votre vrai parcours
            </li>
          </ul>
        </div>
      </aside>

      <main class="main" id="main">
        <div class="main__inner">
          <a class="brand brand--mobile" href="/">
            <span class="brand__mark" aria-hidden="true">F</span>
            <span class="brand__name">FolioForge</span>
          </a>
          <router-outlet />
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        min-height: 100vh;
      }

      /* ── Colonne gauche ── */
      .aside {
        position: relative;
        background: linear-gradient(160deg, #035c80 0%, #024a66 55%, #012f42 100%);
        color: #f0f4f2;
        overflow: hidden;
      }

      /* Halo décoratif discret, purement CSS. */
      .aside::after {
        content: '';
        position: absolute;
        width: 34rem;
        height: 34rem;
        right: -12rem;
        bottom: -14rem;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.08), transparent 70%);
        pointer-events: none;
      }

      .aside__inner {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 3rem;
        height: 100%;
        padding: 2.75rem 3.5rem;
        max-width: 34rem;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        color: inherit;
        text-decoration: none;
        width: fit-content;
      }

      .brand:hover {
        text-decoration: none;
      }

      .brand__mark {
        display: grid;
        place-items: center;
        width: 1.9rem;
        height: 1.9rem;
        border-radius: var(--ff-radius);
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-family: var(--ff-font-display);
        font-size: 1rem;
        font-weight: 600;
      }

      .brand__name {
        font-family: var(--ff-font-display);
        font-size: 1.05rem;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .pitch {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .pitch__title {
        font-size: clamp(1.65rem, 2.4vw, 2.15rem);
        line-height: 1.22;
        font-weight: 500;
        letter-spacing: -0.02em;
      }

      .pitch__text {
        font-size: var(--ff-text-base);
        line-height: 1.65;
        color: rgba(240, 244, 242, 0.72);
        max-width: 30ch;
      }

      .points {
        list-style: none;
        margin: 0 0 auto;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        font-size: var(--ff-text-sm);
        color: rgba(240, 244, 242, 0.78);
      }

      .points li {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
      }

      .points__dot {
        flex: none;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #7fc4e0;
        transform: translateY(-2px);
      }

      /* ── Colonne droite ── */
      .main {
        display: grid;
        place-items: center;
        padding: 2.5rem 1.5rem;
        background: var(--ff-bg);
      }

      .main__inner {
        width: 100%;
        max-width: 26rem;
      }

      .brand--mobile {
        display: none;
        margin-bottom: 2rem;
        color: var(--ff-ink);
      }

      .brand--mobile .brand__mark {
        background: var(--ff-accent);
        border-color: var(--ff-accent);
        color: #fff;
      }

      @media (max-width: 900px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .aside {
          display: none;
        }

        .brand--mobile {
          display: inline-flex;
        }
      }
    `,
  ],
})
export class AuthLayout {}
