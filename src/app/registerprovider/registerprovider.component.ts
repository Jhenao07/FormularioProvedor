import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { services } from '../services';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
@Component({
  selector: 'app-registerprovider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './registerprovider.component.html',
  styleUrl: './registerprovider.component.css'
})
export class RegisterproviderComponent {
  ordenValida = false; // Controla la visibilidad del HTML
  loadingValidacion = true;
  tokenSent = false;
  loading = false;
  userEmail = 'proveedor@ejemplo.com';
  data: any = null;
  form: FormGroup;
  providerType: 'juridica' | 'natural' = 'juridica';


  ngOnInit() {
  this.data = this.dataService.getData();
    const params = this.route.snapshot.queryParams;

    const oc = params['oc'];
    const os = params['os'];

    // 🛡️ ESCUDO PROTECTOR PARA EL PAÍS (Vital para que todo el flujo funcione)
    let sn = params['sn'];
    if (!sn || sn === 'null' || sn === 'undefined') {
      sn = 'CO';
    }
    sn = sn.replace('}', '').toUpperCase();

    if (oc && os && sn) {
      this.validarOrdenAlEntrar(oc, os);
    } else {
      this.mostrarErrorYSalir('Faltan parámetros de seguridad.');
    }
  }

  validarOrdenAlEntrar(oc: string, os: string, ) {
    this.dataService.validarEstadoOrden(oc, os).subscribe({
      next: (res) => {
        if (res.status === 302) {
          this.ordenValida = true; // 🌟 Aquí se "abre" el div del formulario
          this.loadingValidacion = false;
        } else {
          this.mostrarErrorYSalir(res.body?.es || 'Orden no válida');
        }
      },
      error: (err) => {
        const msg = err.error?.es || 'Error de conexión con el servidor';
        this.mostrarErrorYSalir(msg);
      }
    });
  }

  mostrarErrorYSalir(mensaje: string) {
    Swal.fire({
      title: 'Atención',
      text: mensaje,
      icon: 'warning',
      confirmButtonColor: '#2563eb',
      allowOutsideClick: false
    }).then(() => {
      this.router.navigate(['/invited'], { queryParamsHandling: 'preserve' });
    });
  }
  requestToken() {
    this.loading = true;

    // 🚀 SIMULACIÓN: En lugar de llamar a la API, esperamos 1.5s y mostramos las cajas
    setTimeout(() => {
      this.tokenSent = true;
      this.loading = false;

      // Hacemos focus en el primer cuadrito después de un instante
      setTimeout(() => this.focus(0), 100);
    }, 1500);

  }


  constructor(private dataService: services, private fb: FormBuilder, private router: Router, private route: ActivatedRoute) {



   this.form = this.fb.group({
      digits: this.fb.array<FormControl<string>>(
        Array.from({ length: 6 }, () =>
          new FormControl<string>('', {
            nonNullable: true,
            validators: [Validators.required, Validators.pattern(/^\d$/)]
          })
        )
      )
    });

}
@ViewChildren('otpInput') inputs!: QueryList<ElementRef<HTMLInputElement>>;

get digitsFA(): FormArray<FormControl<string>> {
    return this.form.get('digits') as FormArray<FormControl<string>>;
  }

  get token(): string {
    return this.digitsFA.controls.map(c => c.value).join('');
  }

  focus(idx: number) {
    const el = this.inputs.get(idx)?.nativeElement;
    el?.focus();
    el?.select();
  }

  onInput(event: Event, idx: number) {
    const input = event.target as HTMLInputElement;
    input.value = (input.value || '').replace(/\D/g, '').slice(0, 1);
    this.digitsFA.at(idx).setValue(input.value, { emitEvent: false });

    if (input.value && idx < this.digitsFA.length - 1) this.focus(idx + 1);
  }

 onKeydown(event: KeyboardEvent, idx: number) {
    const key = event.key;

    if (key === 'Backspace') {
      const current = this.digitsFA.at(idx).value;
      if (!current && idx > 0) {
        event.preventDefault();
        this.focus(idx - 1);
        this.digitsFA.at(idx - 1).setValue('', { emitEvent: false });
      }
      return;
    }

    if (key === 'ArrowLeft' && idx > 0) {
      event.preventDefault(); this.focus(idx - 1);
    }
    if (key === 'ArrowRight' && idx < this.digitsFA.length - 1) {
      event.preventDefault(); this.focus(idx + 1);
    }
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, 6).split('');
    digits.forEach((d, i) => {
      if (i < this.digitsFA.length) {
        this.digitsFA.at(i).setValue(d, { emitEvent: false });
      }
    });
    const last = Math.min(digits.length, this.digitsFA.length) - 1;
    if (last >= 0) this.focus(last);
  }

  readonly QToken = "123456"

 validateToken() {
    const ingresado = this.token;

    if (ingresado.length < 6 || ingresado !== this.QToken) {
      this.marcarError();
      return;
    }

    // 🌟 Si el token es correcto, navegamos al siguiente componente manteniendo el país
    const snActual = this.route.snapshot.queryParams['sn'] || 'CO';

    this.router.navigate(['/provider'], { queryParamsHandling: 'preserve' });
  }

  marcarError() {
    this.digitsFA.controls.forEach(c => c.setErrors({ invalid: true }));
    const box = document.querySelector('.token-box');
    box?.classList.add('shake');
    setTimeout(() => box?.classList.remove('shake'), 300);
  }


}
