import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { services } from '../services';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
@Component({
  selector: 'app-registerprovider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './registerprovider.component.html',
  styleUrl: './registerprovider.component.css'
})
export class RegisterproviderComponent {

  tokenSent = false;
  loading = false;
  userEmail = 'proveedor@ejemplo.com';
  data: any = null;
  form: FormGroup;
  providerType: 'juridica' | 'natural' = 'juridica';


  ngOnInit() {
    this.data = this.dataService.getData();
    console.log('Datos recibidos:', this.data);


    const params = this.route.snapshot.queryParams;
    console.log('Parámetros de navegación:', params);
  }
  requestToken() {
    this.loading = true;

    this.dataService.sendTokenEmail(this.userEmail).subscribe({
      next: () => {
        this.tokenSent = true;
        this.loading = false;
        setTimeout(() => this.focus(0), 100);
      },
      error: (err) => {
        console.error('Error al enviar token', err);
        alert('No se pudo enviar el token. Intenta de nuevo.');
        this.loading = false;
      }
    });
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

  onInput(event: Event, idx: number) {
    const input = event.target as HTMLInputElement;
    input.value = (input.value || '').replace(/\D/g, '').slice(0, 1);
    this.digitsFA.at(idx).setValue(input.value as any, { emitEvent: false });

    if (input.value && idx < this.digitsFA.length - 1) this.focus(idx + 1);
  }

  onKeydown(event: KeyboardEvent, idx: number) {
    const key = event.key;

    if (key === 'Backspace') {
      const current = this.digitsFA.at(idx).value;
      if (!current && idx > 0) {
        event.preventDefault();
        this.focus(idx - 1);
        this.digitsFA.at(idx - 1).setValue('' as any, { emitEvent: false });
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
        this.digitsFA.at(i).setValue(d as any, { emitEvent: false });
      }
    });
    const last = Math.min(digits.length, this.digitsFA.length) - 1;
    if (last >= 0) this.focus(last);
  }

  focus(idx: number) {
    const el = this.inputs.get(idx)?.nativeElement;
    el?.focus(); el?.select();
  }

  readonly QToken = "123456"


  validateToken() {
  const ingresado = this.token;

  if (ingresado.length < 6) {
    this.marcarError();
    return;
  }

  if (ingresado !== this.QToken) {
    this.marcarError();
    return;
  }

  this.router.navigate(['/provider']);

  }

  marcarError() {
  this.digitsFA.controls.forEach(c => c.setErrors({ invalid: true }));

  const box = document.querySelector('.token-box');
  box?.classList.add('shake');

  setTimeout(() => box?.classList.remove('shake'), 300);
}



  validatedToken() {
    if (this.token.length < 6) {
      const idx = this.digitsFA.controls.findIndex(c => !c.value);
      if (idx >= 0) this.focus(idx);
      return;
    }
    console.log('Token a validar:', this.token);
  }
}
