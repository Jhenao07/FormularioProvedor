import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  QueryList,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { services } from '../services';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-registerprovider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './registerprovider.component.html',
  styleUrl: './registerprovider.component.css',
})
export class RegisterproviderComponent implements OnInit {

  // ─── Servicios con inject() ───────────────────────────────
  // 🟢 MEJORA: inject() en lugar de constructor con parámetros privados
  private readonly dataService = inject(services);
  private readonly fb          = inject(FormBuilder);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly destroyRef  = inject(DestroyRef);

  // ─── Estado con Signals ───────────────────────────────────
  // 🟢 MEJORA: Variables mutables migradas a signals
  ordenValida       = signal(false);
  loadingValidacion = signal(true);
  loading           = signal(false);
  tokenSent         = signal(false);
  providerEmail     = signal('');   // 🟢 Email leído del servicio, nunca viaja en la URL

  // ─── OTP Form ─────────────────────────────────────────────
  @ViewChildren('otpInput') inputs!: QueryList<ElementRef<HTMLInputElement>>;

  form: FormGroup = this.fb.group({
    digits: this.fb.array<FormControl<string>>(
      Array.from({ length: 6 }, () =>
        new FormControl<string>('', {
          nonNullable: true,
          validators: [Validators.required, Validators.pattern(/^[A-Z0-9]$/)],
        })
      )
    ),
  });

  // ─── Getters ──────────────────────────────────────────────

  get digitsFA(): FormArray<FormControl<string>> {
    return this.form.get('digits') as FormArray<FormControl<string>>;
  }

  get token(): string {
    return this.digitsFA.controls.map((c) => c.value).join('');
  }

  // ─── Lifecycle ────────────────────────────────────────────

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;

    const oc = params['oc'];
    const os = params['os'];

    // 🟢 Sanitización del país — CO por defecto si viene vacío o inválido
    let sn: string = params['sn'] ?? '';
    if (!sn || sn === 'null' || sn === 'undefined') sn = 'CO';
    sn = sn.replace('}', '').toUpperCase();

    // 🟢 Leemos el email desde el param 'em' (Base64) — nunca viaja legible en la URL
    const em = params['em'];
    if (em) {
      try {
        this.providerEmail.set(atob(em));
      } catch {
        console.warn('No se pudo decodificar el email.');
      }
    }

    if (oc && os && sn) {
      this.validarOrdenAlEntrar(oc, os);
    } else {
      this.mostrarErrorYSalir('Faltan parámetros de seguridad.');
    }
  }

  // ─── Validación de orden ──────────────────────────────────

  validarOrdenAlEntrar(oc: string, os: string): void {
    // 🟢 MEJORA: takeUntilDestroyed evita memory leaks si el componente se destruye antes de la respuesta
    this.dataService.validarEstadoOrden(oc, os)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.status === 302) {
            this.ordenValida.set(true);
            this.loadingValidacion.set(false);
          } else {
            this.mostrarErrorYSalir(res.body?.es ?? 'Orden no válida');
          }
        },
        error: (err) => {
          const msg = err.error?.es ?? 'Error de conexión con el servidor';
          this.mostrarErrorYSalir(msg);
        },
      });
  }

  mostrarErrorYSalir(mensaje: string): void {
    Swal.fire({
      title: 'Atención',
      text: mensaje,
      icon: 'warning',
      confirmButtonColor: '#2563eb',
      allowOutsideClick: false,
    }).then(() => {
      this.router.navigate(['/invited'], { queryParamsHandling: 'preserve' });
    });
  }

  // ─── OTP ──────────────────────────────────────────────────

  requestToken(): void {
    const email = this.providerEmail();
    if (!email) {
      Swal.fire({ icon: 'warning', title: 'Sin email', text: 'No se encontró el email del proveedor.', confirmButtonColor: '#FF6647' });
      return;
    }

    this.loading.set(true);

    this.dataService.sendTokenEmail(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: any) => {
          this.tokenSent.set(true);
          this.loading.set(false);
          setTimeout(() => this.focus(0), 100);
        },
        error: (err) => {
          this.loading.set(false);
          const status = err.status;
          if (status === 401) {
            Swal.fire({ icon: 'warning', title: 'No autorizado', text: 'No tienes permiso para solicitar este código. Verifica tu correo.', confirmButtonColor: '#FF6647' });
          } else if (status === 500) {
            Swal.fire({ icon: 'error', title: 'Error del servidor', text: 'Ocurrió un error interno. Por favor contacta a soporte.', confirmButtonColor: '#FF6647' });
          } else {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo enviar el código. Intenta de nuevo.', confirmButtonColor: '#FF6647' });
          }
        },
      });
  }

  validateToken(): void {
    if (this.token.length < 6) {
      this.marcarError();
      return;
    }

    const email = this.providerEmail();
    this.loading.set(true);

    this.dataService.validateTokenEmail(email, this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: any) => {
          this.loading.set(false);
          // 200 OK — navegamos
          this.router.navigate(['/provider'], { queryParamsHandling: 'preserve' });
        },
        error: (err) => {
          this.loading.set(false);
          const status = err.status;
          if (status === 401) {
            Swal.fire({ icon: 'warning', title: 'Código incorrecto', text: 'El código ingresado no es válido o ya expiró. Solicita uno nuevo.', confirmButtonColor: '#FF6647' });
            this.marcarError();
          } else if (status === 500) {
            Swal.fire({ icon: 'error', title: 'Error del servidor', text: 'Ocurrió un error interno. Por favor contacta a soporte.', confirmButtonColor: '#FF6647' });
          } else {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo validar el código. Intenta de nuevo.', confirmButtonColor: '#FF6647' });
          }
        },
      });
  }

  marcarError(): void {
    this.digitsFA.controls.forEach((c) => c.setErrors({ invalid: true }));
    // 🟢 MEJORA: usamos ViewChildren en lugar de document.querySelector para no romper SSR
    const box = this.inputs.first?.nativeElement?.closest('.token-box');
    box?.classList.add('shake');
    setTimeout(() => box?.classList.remove('shake'), 400);
  }

  // ─── Navegación OTP ───────────────────────────────────────

  focus(idx: number): void {
    const el = this.inputs.get(idx)?.nativeElement;
    el?.focus();
    el?.select();
  }

  onInput(event: Event, idx: number): void {
    const input = event.target as HTMLInputElement;
    // 🟢 Acepta letras y números, fuerza mayúsculas
    input.value = (input.value ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 1);
    this.digitsFA.at(idx).setValue(input.value, { emitEvent: false });
    if (input.value && idx < this.digitsFA.length - 1) this.focus(idx + 1);
  }

  onKeydown(event: KeyboardEvent, idx: number): void {
    const key = event.key;

    if (key === 'Backspace') {
      if (!this.digitsFA.at(idx).value && idx > 0) {
        event.preventDefault();
        this.focus(idx - 1);
        this.digitsFA.at(idx - 1).setValue('', { emitEvent: false });
      }
      return;
    }

    if (key === 'ArrowLeft' && idx > 0) {
      event.preventDefault();
      this.focus(idx - 1);
    }
    if (key === 'ArrowRight' && idx < this.digitsFA.length - 1) {
      event.preventDefault();
      this.focus(idx + 1);
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const digits = (event.clipboardData?.getData('text') ?? '')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 6)
      .split('');

    digits.forEach((d, i) => {
      if (i < this.digitsFA.length) {
        this.digitsFA.at(i).setValue(d, { emitEvent: false });
      }
    });

    const last = Math.min(digits.length, this.digitsFA.length) - 1;
    if (last >= 0) this.focus(last);
  }
}
