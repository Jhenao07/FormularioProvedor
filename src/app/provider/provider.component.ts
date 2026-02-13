import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValidatorFn } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { ActivatedRoute, Router } from '@angular/router';

interface DocConfig {
  title: string;
  key: string;
}

interface ExtractedData {
  nombres?: string;
  apellidos?: string;
  numeroDocumento?: string;
}

const COUNTRY_CONFIG: Record<string, DocConfig[]> = {
  'Colombia': [
    { title: 'RUT Actualizado', key: 'rut' },
    { title: 'Cámara de Comercio', key: 'camara' },
    { title: 'Certificación Bancaria', key: 'bancaria' }
  ],
  'Estados Unidos': [
    { title: 'Form W-9', key: 'w9' },
    { title: 'ID/Passport', key: 'identity_us' },
    { title: 'Bank Verification', key: 'bank_us' }
  ],
  'México': [
    { title: 'CSF', key: 'csf' },
    { title: 'Domicilio', key: 'domicilio_mx' },
    { title: 'INE', key: 'ine' }
  ],
  'España': [
    { title: 'NIF', key: 'nif' },
    { title: 'AEAT', key: 'aeat' },
    { title: 'IBAN', key: 'iban_es' }
  ],
  'Alemania': [
    { title: 'Steuernummer', key: 'tax_de' },
    { title: 'Handelsregisterauszug', key: 'hraz' },
    { title: 'Bankbestätigung', key: 'bank_de' }
  ]
};

@Component({
  selector: 'app-provider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ProgressOverlayComponent, HttpClientModule],
  templateUrl: './provider.component.html',
  styleUrl: './provider.component.css'
})
export class ProviderComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  // --- Estado ---
  currentStep = 1;
  countrySelected?: string;
  isManualMode = false;
  providerType: 'juridica' | 'natural' = 'juridica';

  arrayItems = signal<DocConfig[]>([]);
  form: FormGroup;

  // --- Overlay UI ---
  overlayOpen = false;
  overlayTitle = '';
  overlaySubtitle: string | null = null;

  constructor() {
    // Inicializamos con grupos vacíos para evitar errores de "undefined" en el HTML
    this.form = this.fb.group({
      step2_docs: this.fb.group({}),
      step3_data: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: ['']
      })
    });
  }

  ngOnInit() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        // Si params está vacío, currentStep será 1 por defecto
        this.currentStep = Number(params['step']) || 1;
        this.countrySelected = params['country'] || undefined;
        this.isManualMode = params['mode'] === 'manual';

        // Si no hay país en la URL, reseteamos el signal de documentos
        if (!this.countrySelected) {
          this.arrayItems.set([]);
        }

        if (this.currentStep === 2 && this.countrySelected) {
          const config = COUNTRY_CONFIG[this.countrySelected] || [];
          this.arrayItems.set(config);
          this.rebuildStep2Docs(config);
        }
      });

  }

  // --- Validador de archivos ---
  atLeastOneFileValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const group = control as FormGroup;
      const controls = group.controls;
      const hasFile = Object.keys(controls).some(key => controls[key].value instanceof File);
      return hasFile ? null : { noFiles: true };
    };
  }

  private rebuildStep2Docs(config: DocConfig[]) {
    const group: any = {};
    config.forEach(doc => {
      group[doc.key] = [null]; // No ponemos required aquí para usar el grupal
    });

    this.form.setControl('step2_docs', this.fb.group(group, {
      validators: [this.atLeastOneFileValidator()]
    }));
  }

  // --- Navegación ---
  onCountryChange(event: Event) {
    const element = event.target as HTMLSelectElement;
    const country = element.value;

    if (!country) return;
    // Navegación absoluta para limpiar la URL de residuos anteriores
    this.router.navigate(['/provider'], { // Asegúrate de poner la ruta exacta de tu componente
      queryParams: {
        step: 1,
        country: country
      },
      // Esto evita que al darle "atrás" el usuario pase por todos los países que seleccionó antes
      replaceUrl: true
    });

    // Reset total de estados internos
    this.arrayItems.set([]);
    this.form.get('step2_docs')?.reset();
  }

  goToStep(step: number) {
    // Validación de seguridad para pasar al paso 3
    if (this.currentStep === 2 && step === 3) {
      const docsGroup = this.form.get('step2_docs');
      if (docsGroup?.invalid) {
        docsGroup.markAllAsTouched();
        return;
      }
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: step },
      queryParamsHandling: 'merge'
    });
  }

  irARegistroManual() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: 3, mode: 'manual', country: 'Otro' },
      queryParamsHandling: 'merge'
    });
  }
    prevStep() {
      if (this.currentStep === 2 || (this.currentStep === 3 && this.isManualMode)) {
        // Volvemos a la ruta base y ELIMINAMOS todos los queryParams
        this.router.navigate(['/provider'], {
          queryParams: {}, // Objeto vacío para limpiar la URL
          replaceUrl: true  // Opcional: para que no pueda volver al país anterior con el botón del navegador
        });

        // Limpiamos el estado interno manualmente por seguridad
        this.countrySelected = undefined;
        this.isManualMode = false;
        this.arrayItems.set([]);
        this.form.get('step2_docs')?.reset();
      } else if (this.currentStep > 1) {
        // Para los demás pasos (del 4 al 3, o del 3 al 2), navegación normal
        this.goToStep(this.currentStep - 1);
      }
    }
  // --- Manejo de archivos y API ---
    onFileSelected(event: Event, docKey: string) {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        // Tu lógica original intacta
        this.form.get(`step2_docs.${docKey}`)?.setValue(file);
        this.form.get('step2_docs')?.updateValueAndValidity();
      }
    }

    removeFile(docKey: string) {
      // 1. Limpiamos el valor en el form control
      this.form.get(`step2_docs.${docKey}`)?.setValue(null);
      this.form.get('step2_docs')?.updateValueAndValidity();

      // 2. Limpiar el input físico para poder re-subir el mismo archivo si se desea
      const fileInput = document.getElementById('file-' + docKey) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }

  procesarPdf(docKey: string) {
    const file = this.form.get(`step2_docs.${docKey}`)?.value;
    if (!(file instanceof File)) return;

    this.overlayOpen = true;
    this.overlayTitle = 'Analizando ' + docKey.toUpperCase();

    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docKey);

    this.http.post<ExtractedData>('https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract-rut', fd)
      .subscribe({
        next: (data) => {
          this.form.get('step3_data')?.patchValue({
            businessName: data.nombres || '',
            nit: data.numeroDocumento || ''
          });
          this.overlayOpen = false;
        },
        error: () => {
          this.overlayTitle = 'Error en extracción';
          setTimeout(() => this.overlayOpen = false, 2000);
        }
      });
  }

  onOverlayClose() {
    this.overlayOpen = false;
  }

    submitForm() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Opcional: mostrar una alerta si algo falta
      alert('Por favor completa todos los campos obligatorios antes de finalizar.');
      return;
    }

    // Estructuramos el objeto final combinando los datos de los grupos
    const finalData = {
      pais: this.countrySelected,
      modo: this.isManualMode ? 'Manual' : 'Asistido',
      documentos: this.form.get('step2_docs')?.value,
      informacion: this.form.get('step3_data')?.value
    };

    console.log('Formulario enviado con éxito:', finalData);

    // Aquí llamarías a tu servicio final de guardado
    this.overlayOpen = true;
    this.overlayTitle = 'Guardando registro...';

    // Simulación de guardado
    setTimeout(() => {
      this.overlayOpen = false;
      alert('Registro completado con éxito.');
      this.router.navigate(['/']); // Redirigir al inicio o dashboard
    }, 2000);
  }
}
