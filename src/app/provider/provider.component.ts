import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { interval, Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import {  } from '../interface/employees.interface';

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
      { title: 'Form W-9 (Request for TIN)', key: 'w9' },
      { title: 'Proof of Identity (ID/Passport)', key: 'identity_us' },
      { title: 'Bank Account Verification', key: 'bank_us' }
    ],
    'México': [
      { title: 'Constancia de Situación Fiscal (CSF)', key: 'csf' },
      { title: 'Comprobante de Domicilio', key: 'domicilio_mx' },
      { title: 'Identificación Oficial (INE)', key: 'ine' }
    ],
    'España': [
      { title: 'Certificado de Identificación Fiscal (NIF)', key: 'nif' },
      { title: 'Certificado de Estar al Corriente (AEAT)', key: 'aeat' },
      { title: 'Certificado de Cuenta Bancaria', key: 'iban_es' }
    ],
    'Alemania': [
      { title: 'Steuernummer (Tax Number Confirmation)', key: 'tax_de' },
      { title: 'Handelsregisterauszug (Commercial Register)', key: 'hraz' },
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


export class ProviderComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  // --- Señales y Estado ---
  previewUrl?: string;
  infiniteOverlayOpen = signal(false);
  infiniteProgress = signal(0);

  arrayItems = signal<DocConfig[]>([]);
  countrySelected?: string;

  fileRut = signal<File | null>(null);
  fileBancaria = signal<File | null>(null);


  // --- Variables públicas para el HTML (NO TOCAR NOMBRES) ---
  overlayOpen = false;
  overlayTitle = 'Procesando...';
  overlaySubtitle: string | null = null;
  overlayIndeterminate = true;
  overlayCurrent = 0;
  overlayTotal = 0;
  overlayClosable = false;

  providerType: 'juridica' | 'natural' = 'juridica';
  currentStep = 1;
  form: FormGroup;

    ngOnInit() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.currentStep = Number(params['step']) || 1;
        this.countrySelected = params['country']; 

        if (this.countrySelected) {
          const config = COUNTRY_CONFIG[this.countrySelected];

          if (config) {
            this.arrayItems.set(config);
            this.actualizarControlesStep1(config);
          } else {
            this.arrayItems.set([]);
            this.limpiarPaso1();
          }
        } else {
          this.arrayItems.set([]);
          this.limpiarPaso1();
        }
      });
  }

  private infiniteSubscription?: Subscription;

  constructor() {
    this.form = this.fb.group({
      step1: this.fb.group({
        rut: [null],
        camara: [null],
        bancaria: [null]
      }, {
        validators: ProviderComponent.atLeastOneFileValidator
      }),
      step2: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: ['']
      }),
      step3: this.fb.group({})
    });
  }

   private actualizarControlesStep1(config: DocConfig[]) {
    const group: any = {};
    config.forEach(doc => {
      group[doc.key] = [null, Validators.required];
    });
    this.form.setControl('step1', this.fb.group(group));
  }

  private limpiarPaso1() {
    // Crea un grupo vacío para evitar errores de referencia en el HTML
    this.form.setControl('step1', this.fb.group({}));
  }


  // --- Validadores Estáticos ---
  static atLeastOneFileValidator(control: AbstractControl) {
    const value = control.value;
    if (!value) return { required: true };

    const hasFile = Object.values(value).some(v => v instanceof File);
    return hasFile ? null : { required: true };
  }

  // --- Lógica del Overlay Infinito (Mejorada con RxJS) ---
  openInfiniteOverlay() {
    this.infiniteOverlayOpen.set(true);
    this.infiniteProgress.set(0);

    // Usamos RxJS interval para un timer más estable y limpio
    this.infiniteSubscription = interval(60).pipe(
      takeUntilDestroyed(this.destroyRef) // Se limpia si el componente se destruye
    ).subscribe(() => {
      let val = this.infiniteProgress() + 1;
      if (val > 100) val = 0;
      this.infiniteProgress.set(val);
    });
  }

  closeInfiniteOverlay() {
    this.infiniteOverlayOpen.set(false);
    this.infiniteSubscription?.unsubscribe();
    this.infiniteProgress.set(0);
  }

  // --- Manejo de Archivos ---
  onFileSelected(event: Event, docType: string) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const control = this.form.get(`step1.${docType}`); // Cambiado a step1

    if (!control) return;

    if (docType === 'rut') this.fileRut.set(file);
    if (docType === 'bancaria') this.fileBancaria.set(file);

    control.setValue(file);
    control.markAsTouched();
    this.form.get('step1')?.updateValueAndValidity();
  }


  // --- Procesamiento de PDF (HTTP) ---
  procesarPdf(docType:string) {

    const validTypes = ['rut', 'camara', 'bancaria'];
    if (!validTypes.includes(docType)) return;

    const file = this.form.get(`step1.${docType}`)?.value as File;

    if (!file) {
      console.warn('No hay PDF seleccionado');
      return;
    }

    // Configuración UI
    this.overlayOpen = true;
    this.overlayTitle = 'Procesando PDF';
    this.overlaySubtitle = 'Analizando el documento…';
    this.overlayIndeterminate = true;
    this.overlayClosable = false;

    const fd = new FormData();
    fd.append('docType', docType);
    fd.append('file', file, file.name);

    this.http.post<ExtractedData>('https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract-rut', fd)      .pipe(takeUntilDestroyed(this.destroyRef)) // Evita memory leaks
      .subscribe({
        next: (data) => {
          this.applyExtractedDataToForm(data, docType);

          // Pequeño delay para UX suave
          setTimeout(() => {
            this.overlayOpen = false;
            this.overlaySubtitle = null;
          }, 200);
        },
        error: (err) => {
          console.error('Error backend:', err);
          this.overlayTitle = 'Error procesando PDF';
          // Manejo seguro del mensaje de error
          this.overlaySubtitle = err?.error?.message || 'No se pudo extraer información.';
          this.overlayIndeterminate = false;
          this.overlayClosable = true;
        }
      });
  }

  removeFile(docType: string) {
      const control = this.form.get(`step1.${docType}`);

      if (control) {
        // 1. Limpiamos el valor en el Form Group
        control.setValue(null);
        control.markAsPristine();
        control.markAsUntouched();

        // 2. Limpiamos los signals internos
        if (docType === 'rut') this.fileRut.set(null);
        if (docType === 'bancaria') this.fileBancaria.set(null);

        // 3. Notificamos el cambio de validez
        this.form.get('step2')?.updateValueAndValidity();

        // 4. RESET NATIVO: Limpiamos el input del DOM
        const inputElement = document.getElementById(`file-input-${docType}`) as HTMLInputElement;
        if (inputElement) {
          inputElement.value = '';
        }
      }
    }


  private applyExtractedDataToForm(data: ExtractedData, docType: string) {
    // Usamos patchValue con los datos tipados
    this.form.patchValue({
      step2: {
        nombres: data.nombres ?? '',
        apellidos: data.apellidos ?? '',
        numeroDocumento: data.numeroDocumento ?? '',
      }
    });
  }

  onOverlayClose() {
    this.overlayOpen = false;
  }

  // --- Getters para el HTML ---
  get tienePdfRut(): boolean {
    const file = this.form.get('step2.rut')?.value;
    return file instanceof File && file.type === 'application/pdf';
  }

  get providerTypes(): string {
    return this.form.get('step1.providerType')?.value;
  }

  // --- Navegación (Steps) ---
  nextStep() {
    const currentGroup = this.getCurrentStepGroup();
    if (!currentGroup) return;

    if (currentGroup.invalid) {
      currentGroup.markAllAsTouched();
      return;
    }
    this.currentStep++;
  }

  prevStep() {
    if (this.currentStep > 1) this.currentStep--;
  }

  goToStep(step: number) {
    this.currentStep = step;
  }

  getCurrentStepGroup(): FormGroup | null {
    // Optimización: acceso directo en lugar de switch si los nombres siguen patrón
    const groupName = `step${this.currentStep}`;
    return this.form.get(groupName) as FormGroup || null;
  }

  selectProvider(type: string) {
    const control = this.form.get('step1.providerType');
    control?.setValue(type);
    control?.markAsTouched();
  }

  submitForm() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = {
      providerType: this.form.value.step1.providerType,
      documents: this.form.value.step2,
      providerData: this.form.value.step3
    };

    console.log('Formulario listo para enviar:', payload);
    // TODO: Conectar API final
  }
}


