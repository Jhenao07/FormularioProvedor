import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  ValidatorFn,
  FormsModule,
} from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { ActivatedRoute, Router } from '@angular/router';
import { services } from '../services';
import Swal from 'sweetalert2';
import { PdfMapService } from './pdfMap.service';
import { DynamicFieldComponent } from '../components/dynamic-field/dynamic-field.component';
import { catchError, concatMap, from, of, toArray } from 'rxjs';


// ─────────────────────────────────────────────
// Interfaces & Constantes
// ─────────────────────────────────────────────

interface DocConfig {
  title: string;
  key: string;
}

interface DireccionToken {
  kind: string;
  text: string;
}

interface CampoDinamico {
  key: string;
  label: string;
  type: string;
  options: any[];
  isLong: boolean;
  columnSpan: number;
  autocompletado: boolean;
  visible: boolean;
  grupoBeneficiario: number;
  grupoDocumento: number;
  seccion: string;
  orderToGetValue: number;
  ordenFijo?: number;
  selectConfig?: any;
  fileConfig?: any;
  tituloInterno?: string;
  required?: boolean;
  idValueField?: string; // ID del registro en la DB para el body del POST
  isWritable?: boolean;
}

interface Indicativo {
  nombre: string;
  codigo: string;   // e.g. "+57"
  bandera: string;  // emoji flag
}

const COUNTRY_CONFIG: Record<string, DocConfig[]> = {
  Colombia: [
    { title: 'RUT Actualizado', key: 'rut' },
    { title: 'Cámara de Comercio', key: 'camara' },
    { title: 'Certificación Bancaria', key: 'bancaria' },
  ],
  'Estados Unidos': [
    { title: 'Form W-9', key: 'w9' },
    { title: 'ID/Passport', key: 'identity_us' },
    { title: 'Bank Verification', key: 'bank_us' },
  ],
  México: [
    { title: 'CSF', key: 'csf' },
    { title: 'Domicilio', key: 'domicilio_mx' },
    { title: 'INE', key: 'ine' },
  ],
  España: [
    { title: 'NIF', key: 'nif' },
    { title: 'AEAT', key: 'aeat' },
    { title: 'IBAN', key: 'iban_es' },
  ],
  Alemania: [
    { title: 'Steuernummer', key: 'tax_de' },
    { title: 'Handelsregisterauszug', key: 'hraz' },
    { title: 'Bankbestätigung', key: 'bank_de' },
  ],
};

const COUNTRY_MAP: Record<string, string> = {
  CO: 'Colombia',
  US: 'Estados Unidos',
  MX: 'México',
  ES: 'España',
  DE: 'Alemania',
};

const CAMPOS_SOLO_NATURAL = ['firstLastName', 'secondLastName', 'identification', 'identificationNumber', 'names'];
const CAMPOS_SOLO_JURIDICA = ['companyname', 'nitId', 'dv', 'representativeName', 'nationalIdentityCard', 'riskControlSystem', 'which risk'];
// Campos que se manejan internamente y nunca deben mostrarse en el formulario
const CAMPOS_OCULTOS_SIEMPRE = ['supplierNationality', 'contactType'];

// ─────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────

@Component({
  selector: 'app-provider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // 🟢 MEJORA: HttpClientModule eliminado — se provee globalmente en app.config.ts con provideHttpClient()
  imports: [CommonModule, ReactiveFormsModule, ProgressOverlayComponent, DynamicFieldComponent, FormsModule],
  templateUrl: './provider.component.html',
  styleUrl: './provider.component.css',
})
export class ProviderComponent implements OnInit {

  // ─── Configuración API ───────────────────────
  private readonly API_BASE_URL = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1';
  private readonly API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExM2UyNDNjLTczZjctNGM4NC05MDE1LWU3NWRkZGFiZDI3MSIsImRhdGEiOiIyN2VmOWRiOTg0OTNhYzBiYjFkMmQ1YjJhYjVhZWFjMWViZjY1NDFhYjE4NGVmNTdmYzU3MGFkZmJhM2M1ODY3ODNmMjBhZjg0ZmQ5Y2ZmYWU3NzljYTY5NmRjMDRlZDFjODRiMzRiZjQyNWU4MTJjMDI3MmZmYjdlNTA1Yjg1YjgxNDFmMzc5NGIzNmEyNTEwYjBmODE4Njg0MzhmZGQ0YWUxYmJiMzJiZjIzMDg3OWRmZWQwMDIwYTJjYzdjOTQ0YjhhNGYxYzM0NDA1ZTRhNWRiY2I0NzA4NTc1NzFhZTYxMWZlMWQyYjYzM2YzNWNkMmExZjMyODI5OTljN2FjZjI4MjNiZjJmOTA1N2JiNDZjZjFlMzExNzg2MDQ0ZWZlOGNkYjA5YmM2YzliMjdlNmEyZDYyYjBhNzFjZjcyNGRhY2I2NGJmNzI4MTZkNmQ0ZTJjYTA1NzRmZjJiYjljODc3ZWJkMjhkNzZhZDMzMDA1NzlmMGZmYTlhMTliYWU2M2UwZWJiN2VmZGFhYTlhNjI4NDEzMGJlMzU5MmY3M2Q3ODIwYzQ0MTg2ZGEzMmNlMzBiNzJhYTc2MDIyYWMzZWVlYjI5MDRlNWNlZWU1YTI5OGQxYTIwNzAwZTM3NWFiMWRkMWEzMzcyMjU3NjFjOGIzMTRlOTE0MzM4MzgzMWVkNDJkZmFkNWQwOGMwOTRkZDg1ZDY4YTU4NTAwYmYzZTY5YWEzMmYyN2IyNjU0ZTBiOWI3MzUyMmU5Njc3MzRlZWNiZTUxMTIwMWJmOTFjY2RkOTJlMGQxMjE5YjFjNTFhZGRhODk0Y2U0ZjQ3ODhjODg5YjkwZTllYmY2YmM1OTlhZDkwZDdhNWY2YWQ4YjJkM2ViYzRmN2ZhMWMzZmEwNDJhMWRlOTAwNjhjN2U2YjEyNjhjZTlkNjdmZGUyYWQwMWNmMjg1N2Q2OWNiNDQ2NTIxNThjYzlkZmQ3YWI5MDNkM2Q5YTZmYmQ5N2Q4MDVhYzc4MDI5NTlhY2ZjZDZjMmQwMThlZTdmYzJjMDRkOGNmNzFjNDRlZTlhNGZhNjY1MDM4YjQyZjcwZTQ4NTAwZGNkMTliYTA5MzM0MzZlOWFkYWYxYzlmOWJlYzM0ZjQ2NDY1NmI0YzJhZjg4YTYyNWI5ZTZmNzcyZTNhYTFkMTZhNDU3YzdjZWFhOWU0ZTQ5N2ZhY2Y0YmRkNmVmZWI2NDMzYTNkZDNmY2FiNDBkZmM4NTViOThkMTI2ZmY5ZmIyMWJiZDBmMTcwNzgyYjEyZjQ0ODk5OGQwZGQ1NDk1YjMzODU3ODViMjU1MmU1YmZhMTUyMDhmNGNiNzhjMTc4ZmNhNDkxYjhhZTc5ZDliOTA3NDk3MTkwYjRhZThkZTIzNmQ4MDExMGMzMWZhYTRiMGVlNzlhNTVkMDhiZGQ4MGE3NjZiN2ExZmYyMzQzNCIsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzczNjYwNTQ2LCJleHAiOjE3NzQyNjUzNDZ9.JqMbuv_kA3CiyxA5mZmuk17Ha2jUTR5vuH1oTR031Ko'
  // ─── Servicios ───────────────────────────────
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly services = inject(services);
  private readonly pdfMapService = inject(PdfMapService);
  // 🟢 MEJORA: ChangeDetectorRef eliminado — Signals + computed() manejan la detección automáticamente

  // ─── Estado con Signals ───────────────────────
  // 🟢 MEJORA: Variables mutables migradas a signals para detección automática de cambios
  ocParam = signal('');
  osParam = signal('');
  snParam = signal('');
  numSoParam = signal('');
  currentStep = signal(1);
  isManualMode = signal(false);
  esJuridica = signal(false);
  esEmpresaJuridica = signal(false);
  countrySelected = signal<string | undefined>(undefined);
  toastMessage = signal<string | null>(null);
  arrayItems = signal<DocConfig[]>([]);
  loadingFormConfig = signal(true);
  overlayOpen = signal(false);
  overlayTitle = signal('');
  overlaySubtitle = signal<string | null>(null);
  contactosActivos = signal(1);
  beneficiariosActivos = signal(0);
  documentosActivos = signal(1);
  modalDireccionAbierto = signal(false);
  campoDireccionActivo = signal('');
  direccionesTokens = signal<DireccionToken[]>([]);
  camposDinamicos = signal<CampoDinamico[]>([]);
  seccionesDisponibles = signal<string[]>([]);
  seccionActualIndex = signal(0);
  mostrarCamposBeneficiario = signal(false);
  formularioEstructuraDestino = signal<any>(null);
  esUsuarioInterno = signal(true);
  archivosAdjuntosDinamicos = signal<Record<string, File>>({});

  // ─── Indicativos telefónicos ──────────────────
  indicativos = signal<Indicativo[]>([]);
  loadingIndicativos = signal(false);
  // Mapa key → indicativo seleccionado
  // Sección 3: TelExt (tel/ext), cellphone (celular)
  // Sección 5: bankPhone (teléfono banco)
  // Sección 1 contactos: fixedCallsign1-5 (indicativo tel fijo), cellPhoneCode1-5 (indicativo cel)
  indicativoSeleccionado = signal<Record<string, string>>({
    TelExt: '+57',
    cellphone: '+57',
    bankPhone: '+57',
    fixedCallsign1: '+57', fixedCallsign2: '+57', fixedCallsign3: '+57', fixedCallsign4: '+57', fixedCallsign5: '+57',
    cellPhoneCode1: '+57', cellPhoneCode2: '+57', cellPhoneCode3: '+57', cellPhoneCode4: '+57', cellPhoneCode5: '+57',
  });
  indicativoDropdownAbierto = signal<string | null>(null); // key del campo con dropdown abierto
  busquedaIndicativo = ''; // variable de búsqueda en el dropdown (no signal — ngModel directo)

  // ─── Computed Signals ─────────────────────────
  // 🟢 MEJORA: Lógica derivada como computed() — se recalcula automáticamente al cambiar dependencias

  /** País y config de documentos derivados del signal countrySelected */
  docsConfig = computed(() => COUNTRY_CONFIG[this.countrySelected() ?? ''] ?? []);

  /** Indica si se puede agregar más beneficiarios */
  puedeAgregarBeneficiario = computed(
    () => this.beneficiariosActivos() < 10
  );

  /** Indica si se puede agregar más contactos */
  puedeAgregarContacto = computed(() => this.contactosActivos() < 5);

  /** Indica si se puede agregar más documentos */
  puedeAgregarDocumento = computed(() => this.documentosActivos() < 10);

  /** Dirección formada a partir de los tokens */
  direccionActual = computed(() =>
    this.direccionesTokens()
      .map((t) => t.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  /** Sección actualmente visible */
  seccionActual = computed(() =>
    this.seccionesDisponibles()[this.seccionActualIndex()]
  );

  /** Campos visibles de la sección actual */
  camposSeccionActual = computed(() =>
    this.camposDinamicos().filter(
      (c) => c.seccion === this.seccionActual() && c.visible !== false
    )
  );

  /** ¿Es la última sección? */
  esUltimaSeccion = computed(
    () => this.seccionActualIndex() === this.seccionesDisponibles().length - 1
  );

  /**
   * Campos de la sección actual agrupados por número de contacto.
   * grupo === 0 → campos normales sin contacto
   * grupo === 1 → Contacto #1, grupo === 2 → Contacto #2, etc.
   */
  camposAgrupados = computed(() => {
    const seccion = this.seccionActual();
    const campos = this.camposDinamicos().filter(
      (c) => c.seccion === seccion && c.visible !== false
    );

    const grupos = new Map<number, CampoDinamico[]>();

    campos.forEach((campo) => {
      const grupo = this.getGrupoContacto(campo.key);
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo)!.push(campo);
    });

    return Array.from(grupos.entries())
      .sort(([a], [b]) => a - b)
      .map(([grupo, camposDelGrupo]) => {

        // 1. Pre-filtramos campos normales
        const normales = camposDelGrupo.filter(c =>
          c.grupoBeneficiario === 0 &&
          c.type !== 'documento-agrupado' && c.type !== 'legal-text' &&
          c.type !== 'bloque-firmas' && c.type !== 'docs-info' &&
          c.type !== 'beneficiary-info' && !c.type.includes('info')
        );

        // 2. Pre-filtramos campos especiales
        const especiales = camposDelGrupo.filter(c =>
          c.grupoBeneficiario === 0 &&
          (c.type === 'documento-agrupado' || c.type === 'legal-text' ||
           c.type === 'bloque-firmas' || c.type === 'docs-info' ||
           c.type === 'beneficiary-info' || c.type.includes('info'))
        );

        // 3. Pre-agrupamos beneficiarios
        const mapBen = new Map<number, CampoDinamico[]>();
        for (const c of camposDelGrupo) {
          if (c.grupoBeneficiario > 0) {
            if (!mapBen.has(c.grupoBeneficiario)) mapBen.set(c.grupoBeneficiario, []);
            mapBen.get(c.grupoBeneficiario)!.push(c);
          }
        }
        const beneficiarios = Array.from(mapBen.entries())
          .sort(([a], [b]) => a - b)
          .map(([gBen, cs]) => ({ grupo: gBen, campos: cs }));

        // Devolvemos el bloque listo para el HTML
        return {
          grupo,
          normales,
          especiales,
          beneficiarios
        };
      });
  });

  // 👇 AGREGA ESTAS 2 FUNCIONCITAS PARA MAYOR SEGURIDAD
  trackByGrupo(index: number, item: any): number { return item.grupo; }
  trackByCampo(index: number, item: CampoDinamico): string { return item.key; }

  // ─── Formulario ───────────────────────────────
  form: FormGroup;
  providerType: 'juridica' | 'natural' = 'juridica';

  dianData = {
    viaInicial: 'CL', numInicial: '', nombreViaInicial: '', letraInicial: '', bisInicial: '', cuadInicial: '',
    placa1: '', placaLetra: '', placaBis: '', placaCuad: '', placa2: '',
    finalTipo: 'AP', finalValor: '', complemento: '',
  };

  constructor() {
    this.form = this.fb.group({
      step2_docs: this.fb.group({}),
      step3_data: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: [''],
      }),
      formDinamico: this.fb.group({}),
    });
  }

  // ─────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────

  ngOnInit(): void {
    this.cargarIndicativos(); // 🌍 Carga lista de países para selector de indicativo telefónico

    // 🟢 MEJORA: takeUntilDestroyed() sin necesidad de pasar destroyRef explícito cuando está en el constructor
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.ocParam.set(params['oc'] ?? '');
        this.osParam.set(params['os'] ?? '');
        this.numSoParam.set(params['numSo'] ?? '');
        this.currentStep.set(Number(params['step']) || 1);
        this.isManualMode.set(params['mode'] === 'manual');

        const snParam = params['sn']?.toUpperCase();
        const pais = COUNTRY_MAP[snParam] ?? 'Otro';
        this.countrySelected.set(pais === 'Otro' ? undefined : pais);

        if (this.numSoParam()) {
          this.cargarEstructuraFormulario(this.numSoParam());
        } else {
          console.warn("No se encontró el parámetro 'numSo' en la URL.");
          this.loadingFormConfig.set(false);
        }

        if (!this.countrySelected()) {
          this.arrayItems.set([]);
          return;
        }

        if (this.currentStep() === 1) {
          const config = this.docsConfig();
          this.arrayItems.set(config);
          this.rebuildStep2Docs(config);
        }
      });
  }

  // ─────────────────────────────────────────────
  // API & Carga
  // ─────────────────────────────────────────────

  cargarEstructuraFormulario(numeroOrden: string): void {
    this.loadingFormConfig.set(true);

    // 🟢 MEJORA: Token movido a environment.ts — nunca en el código fuente
    const apiUrl = `${this.API_BASE_URL}/serviceOrder/getFieldsByServiceOrder/${numeroOrden}`;
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.API_TOKEN}` });

    this.http.get(apiUrl, { headers })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta: any) => {
          console.log('✅ Estructura descargada:', respuesta);
          this.formularioEstructuraDestino.set(respuesta);
          this.loadingFormConfig.set(false);
        },
        error: (error) => {
          console.error('❌ Error cargando estructura:', error);
          this.loadingFormConfig.set(false);
          Swal.fire({
            title: 'Error de conexión',
            text: 'No se pudo cargar la estructura del formulario.',
            icon: 'error',
          });
        },
      });
  }

  // ─────────────────────────────────────────────
  // Navegación
  // ─────────────────────────────────────────────

  goToStep(step: number): void {
    if (this.currentStep() === 2 && step === 3) {
      const docsGroup = this.form.get('step2_docs');
      if (docsGroup?.invalid) {
        docsGroup.markAllAsTouched();
        return;
      }
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step },
      queryParamsHandling: 'merge',
    });
  }

  prevStep(): void {
    const step = this.currentStep();
    if (step === 2 || (step === 3 && this.isManualMode())) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { step: 1 },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      this.countrySelected.set(undefined);
      this.isManualMode.set(false);
      this.arrayItems.set([]);
      this.form.get('step2_docs')?.reset();
    } else if (step > 1) {
      this.goToStep(step - 1);
    }
  }

  irARegistroManual(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: 3, mode: 'manual', country: 'Otro' },
      queryParamsHandling: 'merge',
    });
  }

  siguienteSeccion(): void {
    if (!this.validarSeccionActual()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor, diligencia todos los campos obligatorios (*) de esta sección para continuar.',
        confirmButtonColor: 'var(--accent)',
        background: 'var(--surface)',
        color: 'var(--text)',
      });
      return;
    }

    if (!this.esUltimaSeccion()) {
      this.seccionActualIndex.update((i) => i + 1);
    } else {
      this.currentStep.set(3);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  anteriorSeccion(): void {
    if (this.seccionActualIndex() > 0) {
      this.seccionActualIndex.update((i) => i - 1);
    } else {
      this.currentStep.set(1);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─────────────────────────────────────────────
  // País & Documentos
  // ─────────────────────────────────────────────

  onCountryChange(event: Event): void {
    const country = (event.target as HTMLSelectElement).value;
    if (!country) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: 1, sn: country },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    this.arrayItems.set([]);
    this.form.get('step2_docs')?.reset();
  }

  private rebuildStep2Docs(config: DocConfig[]): void {
    const group: Record<string, any> = {};
    config.forEach((doc) => (group[doc.key] = [null]));
    this.form.setControl(
      'step2_docs',
      this.fb.group(group, { validators: [this.atLeastOneFileValidator()] })
    );
  }

  // ─────────────────────────────────────────────
  // Archivos
  // ─────────────────────────────────────────────

 // ✅ Mapa interno: docKey → extensión del archivo adjuntado
  // Permite renombrar el archivo cuando el usuario elige el tipo DESPUÉS de adjuntarlo
  private extensionesArchivos: Record<string, string> = {};

  onFileSelected(event: Event, docKey: string, fileInput: HTMLInputElement): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const campos = this.camposDinamicos();
  const extension = file.name.split('.').pop() ?? '';
  const matchNum = docKey.match(/\d+/);
  const numDoc = matchNum?.[0] ?? '1';

  // ✅ Guardar la extensión para poder renombrar si el usuario cambia el select después
  this.extensionesArchivos[docKey] = extension;

  // Buscar el select asociado a este campo de documento
  let selectKey: string | null = null;
  if (docKey === 'document1' || (docKey.startsWith('document') && numDoc === '1')) {
    const campo = campos.find(
      (c) =>
        (c.label.toLowerCase().includes('tipo de sistema de gestión') ||
          c.label.toLowerCase().includes('tipo de sistema')) &&
        !c.key.includes('_clon') &&
        c.type !== 'documento-agrupado'
    );
    selectKey = campo?.key ?? null;
  } else if (docKey.startsWith('document') && numDoc !== '1') {
    const cajaAgrupada = campos.find(
      (c) => c.type === 'documento-agrupado' && c.key === `agrupado_${numDoc}`
    );
    selectKey = cajaAgrupada?.selectConfig?.key ?? null;
  }

  const valorSelect = selectKey
    ? (this.form.get('formDinamico')?.get(selectKey)?.value ?? '').trim()
    : '';

  // ✅ Si el select ya tiene valor → usarlo como nombre; si no → nombre original del archivo
  const nombreParaMostrar = valorSelect
    ? `${valorSelect}.${extension}`
    : file.name;

  this.form.get(`step2_docs.${docKey}`)?.setValue(file);
  this.form.get('step2_docs')?.updateValueAndValidity();

  const control = this.form.get('formDinamico')?.get(docKey);
  if (control) {
    control.setValue(nombreParaMostrar);
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity();
  }

  // 🟢 Guardar el File real para subirlo al endpoint después
  this.archivosAdjuntosDinamicos.update(m => ({ ...m, [docKey]: file }));
}

 eliminarDocumentoAdjunto(controlName: string, fileInput: HTMLInputElement): void {
  this.form.get('formDinamico')?.get(controlName)?.setValue('');
  fileInput.value = '';
  this.archivosAdjuntosDinamicos.update(m => {
    const c = { ...m }; delete c[controlName]; return c;
  });
}

 removeFile(docKey = '', fileInput?: HTMLInputElement): void {
    const step = this.currentStep();

    if (step === 1) {
      this.form.get(`step2_docs.${docKey}`)?.setValue(null);
      this.form.get('step2_docs')?.updateValueAndValidity();
    }

    if (step === 2) {
      this.form.get('formDinamico')?.get(docKey)?.setValue('');
    }

    if (fileInput) {
      fileInput.value = '';
    } else {
      const el = document.getElementById('file-' + docKey) as HTMLInputElement | null;
      if (el) el.value = '';
    }

    if (step === 1) {
      this.camposDinamicos.set([]);
      this.form.setControl('formDinamico', this.fb.group({}));
      this.overlayOpen.set(false);

      // 🟢 Reemplazo del alert nativo por SweetAlert2
      Swal.fire({
        icon: 'info',
        title: 'Archivo eliminado',
        text: 'Por favor, adjunta un documento.',
        confirmButtonColor: '#FF6647', // Usando el naranja de tu diseño
        timer: 3000,                   // Se cierra solito en 3 segundos
        timerProgressBar: true         // Muestra una barrita de tiempo
      });
    }
  }

  // ─────────────────────────────────────────────
  // Procesamiento PDF
  // ─────────────────────────────────────────────

  procesarYSiguiente(): void {
    const file = this.form.get('step2_docs.rut')?.value;

    if (file instanceof File) {
      this.overlayOpen.set(true);
      this.overlayTitle.set('Extrayendo Documento...');
      this.overlaySubtitle.set('Analizando datos con IA');
      this.procesarPdf('rut');
    } else {
      this.currentStep.set(2);
    }
  }

  procesarPdf(docKey: string): void {
    const file = this.form.get(`step2_docs.${docKey}`)?.value;
    if (!(file instanceof File)) return;

    this.overlayOpen.set(true);
    this.overlayTitle.set('Extrayendo Documento...');

    this.services.startExtraction(file, docKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: any) => {
          if (data.jobId) {
            this.iniciarPolling(data.jobId);
          } else {
            Swal.fire({
              icon: 'error',
              title: 'Error de Ticket',
              text: 'No se recibió Ticket de AWS. Intenta de nuevo.',
              confirmButtonColor: 'var(--accent)',
            });
          }
        },
        error: (err: any) => {
          console.error('❌ Error enviando PDF:', err);
          Swal.fire({
            icon: 'error',
            title: 'Error de conexión',
            text: 'Error de conexión con AWS.',
            confirmButtonColor: 'var(--accent)',
          });
        },
      });
  }

  iniciarPolling(jobId: string, intentos = 0): void {
    if (intentos > 20) {
      this.overlayOpen.set(false);
      Swal.fire({
        icon: 'warning',
        title: 'Tiempo agotado',
        text: 'El procesamiento está tardando demasiado. Por favor, borra el archivo e intenta subirlo de nuevo.',
        confirmButtonColor: 'var(--accent)',
      });
      return;
    }

    this.services.checkStatus(jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: any) => {
          const estado = res.status?.toLowerCase() ?? '';
          const progreso = res.progress ?? 0;

          this.overlayTitle.set(`Analizando documento (${progreso}%)...`);

          if (estado === 'completed' || progreso === 100) {
            this.extraerDatosDelJSON(res);
          } else if (estado === 'failed' || estado === 'error') {
            this.overlayTitle.set('Error leyendo el documento en AWS');
            setTimeout(() => {
              this.overlayOpen.set(false);
              Swal.fire('Error', 'AWS no pudo procesar este archivo. Intenta con uno más claro.', 'error');
            }, 1500);
          } else {
            setTimeout(() => this.iniciarPolling(jobId, intentos + 1), 5000);
          }
        },
        error: (err: any) => {
          console.error('Error de red en el polling:', err);
          if (intentos < 3) {
            setTimeout(() => this.iniciarPolling(jobId, intentos + 1), 5000);
          } else {
            this.overlayOpen.set(false);
            Swal.fire({
              icon: 'error',
              title: 'Error de conexión',
              text: 'Perdimos conexión con el servidor. Borra el archivo y vuelve a intentar.',
              confirmButtonColor: 'var(--error)',
            });
          }
        },
      });
  }

  // ─────────────────────────────────────────────
  // Contactos
  // ─────────────────────────────────────────────

  getGrupoContacto(key: string): number {
    if (!key) return 0;
    // Todos los campos de contacto DEBEN tener número: contactType1-5, contactPerson1-5, etc.
    const match = key.match(/^(contactType|contactPerson|positionCompany|email|TelExt|cellphone|fixedCallsign|phone|ext|cellPhoneCode)(\d+)$/);
    return match?.[2] ? parseInt(match[2], 10) : 0;
  }

  esInicioDeContacto(index: number): boolean {
    const campos = this.camposDinamicos();
    const campo = campos[index];
    const grupoActual = this.getGrupoContacto(campo.key);

    if (grupoActual === 0 || campo.visible === false) return false;

    for (let i = index - 1; i >= 0; i--) {
      if (campos[i].visible !== false) {
        return this.getGrupoContacto(campos[i].key) !== grupoActual;
      }
    }
    return true;
  }

  agregarContacto(): void {
    if (!this.puedeAgregarContacto()) {
      this.mostrarLimiteAlcanzado('Solo se permiten hasta 5 personas de contacto.');
      return;
    }

    this.contactosActivos.update((n) => n + 1);
    const nuevoGrupo = this.contactosActivos();

    this.camposDinamicos.update((campos) =>
      campos.map((c) =>
        this.getGrupoContacto(c.key) === nuevoGrupo ? { ...c, visible: true } : c
      )
    );

    // Crear controles faltantes en el FormGroup para el nuevo grupo
    const formDinamico = this.form.get('formDinamico') as any;
    if (formDinamico) {
      const camposNuevoGrupo = this.camposDinamicos().filter(
        (c) => this.getGrupoContacto(c.key) === nuevoGrupo
      );
      camposNuevoGrupo.forEach((c) => {
        if (!formDinamico.contains(c.key)) {
          formDinamico.addControl(c.key, this.fb.control(''));
        }
      });
    }
  }

  eliminarEsteContacto(grupo: number): void {
    Swal.fire({
      title: '¿Eliminar contacto?',
      text: 'Se borrarán los datos de esta persona. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--error)',
      cancelButtonColor: 'var(--surface-3)',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      background: 'var(--surface)',
      color: 'var(--text)',
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.camposDinamicos.update((campos) =>
        campos.map((c) => {
          if (this.getGrupoContacto(c.key) !== grupo) return c;
          const control = this.form.get('formDinamico')?.get(c.key);
          control?.setValue('');
          control?.markAsUntouched();
          control?.setErrors(null);
          return { ...c, visible: false };
        })
      );

      if (this.contactosActivos() > 1) {
        this.contactosActivos.update((n) => n - 1);
      }
    });
  }

  // ─────────────────────────────────────────────
  // Indicativos telefónicos
  // ─────────────────────────────────────────────

  cargarIndicativos(): void {
    this.loadingIndicativos.set(true);
    // API: { name: { common }, idd: { root, suffixes[] }, flag: '🇨🇴' }
    // Regla:
    //   suffixes tiene 1 elemento no vacío y corto (≤3 chars) → root + suffix  (Colombia: +5+7=+57)
    //   suffixes vacío, o tiene '' o múltiples o sufijo largo  → solo root     (USA: +1, Russia: +7)
    this.http.get<any[]>('https://restcountries.com/v3.1/all?fields=name,idd,flag')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (paises) => {
          const lista: Indicativo[] = paises
            .filter(p => p.idd?.root && p.name?.common)
            .map(p => {
              const suffixes: string[] = (p.idd.suffixes ?? []).filter((s: string) => s !== '');
              // Solo concatenar si hay exactamente 1 sufijo corto (no es USA con 300 sufijos)
              const usarSufijo = suffixes.length === 1 && suffixes[0].length <= 3;
              const codigo = usarSufijo ? p.idd.root + suffixes[0] : p.idd.root;
              return {
                nombre: p.name.common as string,
                codigo: codigo.trim(),
                bandera: p.flag ?? '',
              };
            })
            .filter(p => /^\+\d/.test(p.codigo))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
          this.indicativos.set(lista);
          this.loadingIndicativos.set(false);
        },
        error: () => this.loadingIndicativos.set(false),
      });
  }

  setIndicativo(campoKey: string, codigo: string): void {
    this.indicativoSeleccionado.update(m => ({ ...m, [campoKey]: codigo }));
    this.indicativoDropdownAbierto.set(null);
  }

  toggleIndicativoDropdown(campoKey: string): void {
    this.indicativoDropdownAbierto.update(v => v === campoKey ? null : campoKey);
  }

  getPhoneValue(campoKey: string): string {
    return this.form.get('formDinamico')?.get(campoKey)?.value ?? '';
  }

  // Cierra dropdown de indicativo si se hace clic fuera
  cerrarDropdownIndicativo(): void {
    this.indicativoDropdownAbierto.set(null);
  }

  // 🟢 Para campos fixedCallsign/cellPhoneCode, el número real está en otro campo (phone/cellphone)
  // fixedCallsign1 → phone1 (tel)   |   cellPhoneCode1 → cellphone1 (cel)
  getPhoneInputKey(campoKey: string): string {
    const m1 = campoKey.match(/^fixedCallsign(\d+)$/);
    if (m1) return 'phone' + m1[1];
    const m2 = campoKey.match(/^cellPhoneCode(\d+)$/);
    if (m2) return 'cellphone' + m2[1];
    return campoKey;
  }

  // 🟢 Para fixedCallsign → retorna key de extensión (ext1, ext2...)
  getExtKey(campoKey: string): string {
    const m = campoKey.match(/^fixedCallsign(\d+)$/);
    return m ? 'ext' + m[1] : '';
  }

  // 🟢 ¿Este campo de indicativo tiene extensión asociada?
  tieneExt(campoKey: string): boolean {
    return /^fixedCallsign\d+$/.test(campoKey);
  }

  // 🟢 Cierra el dropdown al hacer clic en cualquier parte del documento
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.indicativoDropdownAbierto()) {
      this.indicativoDropdownAbierto.set(null);
      this.busquedaIndicativo = '';
    }
  }

  // 🟢 Países filtrados por búsqueda
  getIndicativosFiltrados(): Indicativo[] {
    const q = this.busquedaIndicativo.toLowerCase().trim();
    if (!q) return this.indicativos();
    return this.indicativos().filter(i =>
      i.nombre.toLowerCase().includes(q) || i.codigo.includes(q)
    );
  }

  // 🟢 Helper para template — Angular no permite .find() con arrow en interpolación
  getBanderaIndicativo(campoKey: string): string {
    const codigo = this.indicativoSeleccionado()[campoKey] ?? '+57';
    return this.indicativos().find(i => i.codigo === codigo)?.bandera ?? '🌍';
  }

  getCodigoIndicativo(campoKey: string): string {
    return this.indicativoSeleccionado()[campoKey] ?? '+57';
  }

  // ─────────────────────────────────────────────
  // Beneficiarios
  // ─────────────────────────────────────────────

  esInicioDeBeneficiario(index: number): boolean {
    const campos = this.camposDinamicos();
    const campo = campos[index];
    if (campo.grupoBeneficiario === 0 || campo.visible === false) return false;

    for (let i = index - 1; i >= 0; i--) {
      if (campos[i].visible !== false) {
        return campos[i].grupoBeneficiario !== campo.grupoBeneficiario;
      }
    }
    return true;
  }

  // 🟢 Agrupa campos por grupoBeneficiario para renderizado en tabla
  getCamposBeneficiarios(campos: CampoDinamico[]): { grupo: number; campos: CampoDinamico[] }[] {
    const map = new Map<number, CampoDinamico[]>();
    for (const c of campos) {
      if (c.grupoBeneficiario > 0) {
        if (!map.has(c.grupoBeneficiario)) map.set(c.grupoBeneficiario, []);
        map.get(c.grupoBeneficiario)!.push(c);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b).map(([grupo, cs]) => ({ grupo, campos: cs }));
  }

  // 🟢 Campos normales sin beneficiario
  getCamposNormales(campos: CampoDinamico[]): CampoDinamico[] {
    return campos.filter(c =>
      c.grupoBeneficiario === 0 &&
      c.type !== 'documento-agrupado' && c.type !== 'legal-text' &&
      c.type !== 'bloque-firmas' && c.type !== 'docs-info' &&
      c.type !== 'beneficiary-info' && !c.type.includes('info')
    );
  }

  // 🟢 Campos especiales (legal, firmas, docs-info, etc.) sin beneficiario
  getCamposEspeciales(campos: CampoDinamico[]): CampoDinamico[] {
    return campos.filter(c =>
      c.grupoBeneficiario === 0 &&
      (c.type === 'documento-agrupado' || c.type === 'legal-text' ||
       c.type === 'bloque-firmas' || c.type === 'docs-info' ||
       c.type === 'beneficiary-info' || c.type.includes('info'))
    );
  }

  mostrarBotonBeneficiario(index: number): boolean {
    const campos = this.camposDinamicos();
    if (!this.puedeAgregarBeneficiario()) return false;

    const campoActual = campos[index];
    if (campoActual.visible === false) return false;

    if (this.beneficiariosActivos() === 0) {
      const primerOculto = campos.findIndex((c) => c.grupoBeneficiario > 0);
      return primerOculto > 0 && index === primerOculto - 1;
    }

    let ultimoIndiceVisible = -1;
    for (let i = campos.length - 1; i >= 0; i--) {
      if (campos[i].grupoBeneficiario > 0 && campos[i].visible !== false) {
        ultimoIndiceVisible = i;
        break;
      }
    }
    return index === ultimoIndiceVisible;
  }

  agregarBeneficiario(): void {
    if (!this.puedeAgregarBeneficiario()) {
      this.mostrarLimiteAlcanzado('Has alcanzado el límite máximo permitido de 10 beneficiarios finales.');
      return;
    }

    this.beneficiariosActivos.update((n) => n + 1);
    const nuevoBeneficiario = this.beneficiariosActivos();

    // Hacer visibles los campos del grupo
    this.camposDinamicos.update((campos) =>
      campos.map((c) =>
        c.grupoBeneficiario === nuevoBeneficiario
          ? { ...c, visible: true, seccion: '1. Información del Proveedor' }
          : c
      )
    );

    // 🔑 Crear controles reactivos en el FormGroup para que el template pueda bindearlos
    const formDinamico = this.form.get('formDinamico') as any;
    if (formDinamico) {
      const camposNuevos = this.camposDinamicos().filter(
        (c) => c.grupoBeneficiario === nuevoBeneficiario
      );
      camposNuevos.forEach((c) => {
        if (!formDinamico.contains(c.key)) {
          formDinamico.addControl(c.key, this.fb.control(''));
        }
      });
    }
  }

  eliminarEsteBeneficiario(grupo: number): void {
    Swal.fire({
      title: '¿Quitar beneficiario?',
      text: 'Se borrarán los datos que hayas ingresado para este beneficiario.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--error)',
      cancelButtonColor: 'var(--surface-3)',
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      background: 'var(--surface)',
      color: 'var(--text)',
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.camposDinamicos.update((campos) =>
        campos.map((c) => {
          if (c.grupoBeneficiario !== grupo) return c;
          const control = this.form.get('formDinamico')?.get(c.key);
          control?.setValue('');
          control?.markAsUntouched();
          control?.setErrors(null);
          return { ...c, visible: false };
        })
      );

      if (this.beneficiariosActivos() > 0) {
        this.beneficiariosActivos.update((n) => n - 1);
      }
    });
  }

  eliminarUltimoBeneficiario(): void {
    if (this.beneficiariosActivos() === 0) return;
    this.eliminarEsteBeneficiario(this.beneficiariosActivos());
  }

  // ─────────────────────────────────────────────
  // Documentos adicionales
  // ─────────────────────────────────────────────

  agregarDocumento(): void {
    if (!this.puedeAgregarDocumento()) return;

    this.documentosActivos.update((n) => n + 1);
    const nuevoIndex = this.documentosActivos();

    const campos = [...this.camposDinamicos()];
    const docIndex = campos.findIndex((c) => c.key === `document${nuevoIndex}`);
    if (docIndex === -1) return;

    const docOriginal = { ...campos[docIndex] };
    campos.splice(docIndex, 1);

    const selectOriginal = campos.find(
      (c) =>
        (c.label.toLowerCase().includes('tipo de sistema de gestión') ||
          c.label.toLowerCase().includes('tipo de sistema')) &&
        !c.key.includes('_clon') &&
        c.type !== 'documento-agrupado'
    );

    if (selectOriginal) {
      const nuevaLlaveSelect = `${selectOriginal.key}_clon${nuevoIndex}`;

      const clonSelect: CampoDinamico = {
        ...selectOriginal,
        key: nuevaLlaveSelect,
        label: `${selectOriginal.label} ${nuevoIndex}`,
        grupoDocumento: nuevoIndex,
        visible: true,
      };

      const formDinamico = this.form.get('formDinamico') as FormGroup;
      formDinamico?.addControl(nuevaLlaveSelect, this.fb.control(''));

      // ✅ Escuchar cambios en el select clonado para renombrar el archivo ya adjuntado
      // Caso: usuario adjunta archivo primero, y luego elige el tipo de sistema
      formDinamico?.get(nuevaLlaveSelect)?.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((nuevoTipo: string) => {
          const fileKey = docOriginal.key;
          const ext = this.extensionesArchivos[fileKey];
          if (!nuevoTipo?.trim() || !ext) return;
          const nuevoNombre = `${nuevoTipo.trim()}.${ext}`;
          const ctrl = formDinamico?.get(fileKey);
          if (ctrl) {
            ctrl.setValue(nuevoNombre, { emitEvent: false });
          }
        });

      const llaveAnterior = nuevoIndex === 2 ? 'document1' : `agrupado_${nuevoIndex - 1}`;
      const indexAnterior = campos.findIndex((c) => c.key === llaveAnterior);
      const seccionHeredada = indexAnterior !== -1 ? campos[indexAnterior].seccion : '1. Información del Proveedor';

      docOriginal.visible = true;
      docOriginal.label = `Documento ${nuevoIndex}`;
      docOriginal.grupoDocumento = nuevoIndex;

      const campoAgrupado: CampoDinamico = {
        type: 'documento-agrupado',
        key: `agrupado_${nuevoIndex}`,
        visible: true,
        isLong: true,
        seccion: seccionHeredada,
        tituloInterno: `📁 Documento Adicional ${nuevoIndex - 1}`,
        selectConfig: clonSelect,
        fileConfig: docOriginal,
        label: '',
        options: [],
        columnSpan: 1,
        autocompletado: false,
        grupoBeneficiario: 0,
        grupoDocumento: nuevoIndex,
        orderToGetValue: 99,
      };

      const insertIndex = indexAnterior !== -1 ? indexAnterior + 1 : campos.length;
      campos.splice(insertIndex, 0, campoAgrupado);
    }

    // ✅ FIX: Registrar el control reactivo del archivo en formDinamico si aún no existe.
    // Sin esto, Angular no puede bindear el campo del documento adicional y solo
    // renderiza el primero (document1) que ya tenía su control desde el inicio.
    const formDinamico = this.form.get('formDinamico') as FormGroup;
    if (formDinamico && !formDinamico.contains(docOriginal.key)) {
      formDinamico.addControl(docOriginal.key, this.fb.control(''));
    }

    this.camposDinamicos.set(campos);
  }

  // ─────────────────────────────────────────────
  // Secciones
  // ─────────────────────────────────────────────

  esInicioDeSeccion(index: number): boolean {
    const campos = this.camposDinamicos();
    const campoActual = campos[index];
    if (campoActual.visible === false) return false;

    for (let i = index - 1; i >= 0; i--) {
      if (campos[i].visible !== false) {
        return campos[i].seccion !== campoActual.seccion;
      }
    }
    return true;
  }

  validarSeccionActual(): boolean {
    let esValido = true;
    this.camposSeccionActual().forEach((c) => {
      const control = this.form.get('formDinamico')?.get(c.key);
      if (control?.invalid) {
        control.markAsTouched();
        esValido = false;
      }
    });
    return esValido;
  }

  getNombreCorto(seccion: string): string {
    const nombre = seccion.replace(/^\d+\.\s*/, '').toUpperCase();
    if (nombre.includes('GENERAL')) return 'Info. General';
    if (nombre.includes('TRIBUTARIA')) return 'Tributaria';
    if (nombre.includes('BANCARIA')) return 'Bancaria';
    if (nombre.includes('DOCUMENTACIÓN') || nombre.includes('REQUERIDA')) return 'Documentos';
    if (nombre.includes('CUMPLIMIENTO') || nombre.includes('LEGAL')) return 'Legal';
    if (nombre.includes('NUVANT')) return 'Uso Interno';
    return nombre.length > 15 ? nombre.substring(0, 15) + '...' : nombre;
  }

  // ─────────────────────────────────────────────
  // Extracción de datos PDF
  // ─────────────────────────────────────────────

  async extraerDatosDelJSON(statusRes: any): Promise<void> {
    try {
      const fieldsExtraidos = statusRes.result?.resultsByPage?.[0]?.fields ?? [];
      const campoFecha = fieldsExtraidos.find((f: any) => f.field === 'Fecha generación documento');

      if (campoFecha?.value) {
        const esValido = this.validarVigenciaRut(campoFecha.value);
        if (!esValido) {
          this.overlayOpen.set(false);
          await Swal.fire({
            title: 'Documento Vencido',
            text: 'El documento tiene más de 30 días de antigüedad. Por favor, adjunta uno reciente.',
            icon: 'error',
            confirmButtonColor: 'var(--accent)',
            background: 'var(--surface)',
            color: 'var(--text)',
          });
          this.removeFile();
          return;
        }
      }

      this.overlayTitle.set('Organizando la información...');
      this.overlaySubtitle.set('Casi listo');

      // Detectar tipo de persona desde PDF extraído
      const tipoContribuyente = fieldsExtraidos.find((f: any) =>
        f.field.includes('Tipo de contribuyente')
      );
      let esJuridica = !!tipoContribuyente?.value?.toLowerCase().includes('jurídica');

      // Si el PDF no dio resultado, detectar desde los campos de la estructura del API:
      // Si existen campos de persona jurídica (companyname, nitId, dv, etc.) → es jurídica
      if (!tipoContribuyente) {
        const estructuraActual = this.formularioEstructuraDestino();
        const todosLosItems = [
          ...(estructuraActual?.allowedToRead?.data ?? []),
          ...(estructuraActual?.isAllowedToWrite?.data ?? [])
        ];
        const tieneJuridica = todosLosItems.some((item: any) =>
          ['companyname', 'nitId', 'dv', 'representativeName', 'nationalIdentityCard']
            .includes(item.fields?.labelId)
        );
        const tieneNatural = todosLosItems.some((item: any) =>
          ['firstLastName', 'secondLastName', 'names', 'identification', 'identificationNumber']
            .includes(item.fields?.labelId)
        );
        // Si ambas o ninguna, default jurídica
        esJuridica = tieneJuridica || (!tieneNatural);
      }

      this.esJuridica.set(esJuridica);
      this.esEmpresaJuridica.set(esJuridica);

      const nuevoCamposDinamicos: CampoDinamico[] = [];
      const controlesReactivos: Record<string, any> = {};

      let estructura = this.formularioEstructuraDestino();
      if (estructura) {
        estructura = this.pdfMapService.fillFormWithPdfData(statusRes, estructura);
        this.formularioEstructuraDestino.set(estructura);

        const dataRead = estructura.allowedToRead?.data ?? [];
        const dataWrite = estructura.isAllowedToWrite?.data ?? [];

        const mappedRead = dataRead.map((item: any) => ({ ...item, _isWritable: false }));
        const mappedWrite = dataWrite.map((item: any) => ({ ...item, _isWritable: true }));


        // 🔑 IMPORTANTE: dataWrite tiene valueField reales → sus valores deben prevalecer sobre dataRead
        // Construimos un mapa id→valueField de dataWrite para lookup rápido
        // NO deduplicamos por labelId porque puede haber múltiples registros con el mismo labelId
        // (ej: finalBeneficiaryName1..10, contactPerson1..5, phone1..5, etc.)
        const writeValuesById = new Map<string, any>();
        dataWrite.forEach((item: any) => {
          if (item.id) writeValuesById.set(item.id, item.valueField);
        });

        // Procesamos todos los items: dataRead primero, luego dataWrite
        // Para items que están en dataWrite, el valueField ya viene correcto
        [ ...mappedRead, ...mappedWrite].forEach((itemPlantilla: any) => {

          const fields = itemPlantilla.fields;

          if (!fields?.labelId) return;


          const key: string = fields.labelId;
          // Usar el valueField del item directamente (dataWrite ya tiene los valores reales)
          const valorExtraido = itemPlantilla.valueField;
          const fueExtraido = valorExtraido !== null && valorExtraido !== undefined && String(valorExtraido).trim() !== '';

          // Filtrar campos según tipo de persona
          let esCampoParaEsteUsuario = true;
          if (esJuridica) {
            if (CAMPOS_SOLO_NATURAL.includes(key)) esCampoParaEsteUsuario = false;
          } else {
            if (CAMPOS_SOLO_JURIDICA.includes(key) || key.toLowerCase().includes('beneficiary')) esCampoParaEsteUsuario = false;
          }

          const nroContacto = this.getGrupoContacto(key);
          let esVisible = nroContacto <= 1;
          let grupoBeneficiario = 0;
          let grupoDocumento = 0;

          if (esJuridica && key.toLowerCase().includes('beneficiary')) {
            const match = key.match(/\d+/);
            if (match) {
              grupoBeneficiario = parseInt(match[0], 10);
              esVisible = false;
            }
          }

          if (key.startsWith('document')) {
            const match = key.match(/\d+/);
            if (match) {
              grupoDocumento = parseInt(match[0], 10);
              if (grupoDocumento > this.documentosActivos()) esVisible = false;
            }
          }

          if (CAMPOS_OCULTOS_SIEMPRE.includes(key)) esCampoParaEsteUsuario = false;

          // Para dataWrite: si la key ya existe en controlesReactivos (vino de dataRead con valor vacío),
          // actualizar con el valor real de dataWrite
          if (controlesReactivos[key] !== undefined && fueExtraido && esCampoParaEsteUsuario) {
            const valorMayusUpd = typeof valorExtraido === 'string' ? valorExtraido.toUpperCase() : valorExtraido;
            controlesReactivos[key] = [valorMayusUpd];
          }
          if (!controlesReactivos[key] && esCampoParaEsteUsuario) {
            // Forzar mayúsculas en el valor cargado desde el API
            const valorMayus = (fueExtraido && typeof valorExtraido === 'string')
              ? valorExtraido.toUpperCase()
              : (fueExtraido ? valorExtraido : '');
            controlesReactivos[key] = [valorMayus];

            // ── Sección por orderToGetValue (del JSON real del API) ──
            // OTV 1-16   → sección 1 (Información del Proveedor)
            // OTV 17-29  → sección 3 (Info. General del Proveedor: contactos, ciudad, dirección)
            // OTV 30-38  → sección 4 (Tributaria)
            // OTV 39-50  → sección 5 (Bancaria)
            // OTV 51-62  → sección 6 (Documentación Requerida)
            // OTV 63-75  → sección 8 (Uso Interno / Nuvant)
            const otv = fields.orderToGetValue ?? 99;
            let nombreSeccion: string;
            if (otv <= 16)      nombreSeccion = '1. Información del Proveedor';
            else if (otv <= 29) nombreSeccion = '3. INFORMACIÓN GENERAL DEL PROVEEDOR';
            else if (otv <= 38) nombreSeccion = '4. INFORMACIÓN TRIBUTARIA';
            else if (otv <= 50) nombreSeccion = '5. INFORMACIÓN BANCARIA';
            else if (otv <= 62) nombreSeccion = '6. DOCUMENTACIÓN REQUERIDA';
            else                nombreSeccion = '8. ESPACIO EXCLUSIVO PARA NUVANT';

            // Overrides específicos
            if (grupoBeneficiario > 0 || key.toLowerCase().includes('beneficiary')) nombreSeccion = '1. Información del Proveedor';
            if (nroContacto > 0 || key.toLowerCase().includes('contact')) nombreSeccion = '3. INFORMACIÓN GENERAL DEL PROVEEDOR';

            // Forzar type 'phone' para campos de indicativo telefónico de contactos
            // phone1-5, ext1-5, cellphone1-5 se renderizan DENTRO del bloque del selector → ocultar como campo independiente
            const esSubcampoDeTelefono = (
              /^phone\d+$/.test(key) ||
              /^ext\d+$/.test(key) ||
              /^cellphone\d+$/.test(key)
            );
            const tipoForzado = esSubcampoDeTelefono ? 'hidden-phone-sub'
              : (key.startsWith('fixedCallsign') || key.startsWith('cellPhoneCode')) ? 'phone'
              : (fields.labelType ?? 'text');

            // ── Si es contactType (sin número), ignorar — el backend ya manda contactType1-5 ──
            if (key === 'contactType') return;

            // ── Para contactType1-5: forzar select con las opciones correctas ──
            const esContactTypeNumerado = /^contactType\d+$/.test(key);
            const tipoFinal = esContactTypeNumerado ? 'select' : tipoForzado;
            const opcionesFinal = esContactTypeNumerado
              ? ['Comprobantes de pago', 'Comercial', 'Cartera']
              : (fields.options ?? []);

            nuevoCamposDinamicos.push({
              key,
              label: fields.labelName,
              idValueField: itemPlantilla.id ?? '',
              visible: esVisible,
              seccion: nombreSeccion,
              type: tipoFinal,
              options: opcionesFinal,
              isLong: false,
              columnSpan: fields.columnSpan ?? 1,
              autocompletado: false,
              grupoBeneficiario,
              grupoDocumento,
              orderToGetValue: fields.orderToGetValue ?? 99,
              isWritable: itemPlantilla._isWritable,
            });
          }
        });
      }

      // Campos manuales adicionales (definición compacta)
      const camposManuales: Partial<CampoDinamico>[] = [
        // contactPerson1-5, positionCompany1-5, email1-5, phone1-5, cellphone1-5 etc.
        // YA VIENEN DEL API con número → no se definen aquí para evitar duplicados en grupo 0
        { key: 'department', label: 'Departamento', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'City', label: 'Ciudad', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'address', label: 'Dirección', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'addressHeadquarters', label: 'Dirección (2) sede', type: 'text', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 1 },
        { key: 'texto_info_beneficiario', label: '', type: 'beneficiary-info', seccion: '3. INFORMACIÓN GENERAL DEL PROVEEDOR', visible: true, columnSpan: 3, ordenFijo: 15.5 },
        { key: 'companyType', label: 'Tipo empresa', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'ivaRegime', label: 'Régimen de IVA', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'largeTaxpayer', label: 'Gran Contribuyente', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'numberResolutionDate', label: 'No. y fecha Resolución (Gran Contrib.)', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'selfRetaining', label: 'Autorretenedor', type: 'select', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'selfRetainingNumberResolutionDate', label: 'No. y fecha Resolución (Autorret.)', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'icaActivityCode', label: 'Código actividad ICA', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'icaFee', label: 'Tarifa ICA', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'economicActivity', label: 'Actividad económica (código CIUU)', type: 'text', seccion: '4. INFORMACIÓN TRIBUTARIA', visible: true, columnSpan: 1 },
        { key: 'nameBank', label: 'Nombre del banco', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'branch', label: 'Sucursal', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'countryCity', label: 'País/ciudad', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'bankAddress', label: 'Dirección', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'bankPhone', label: 'Teléfono', type: 'phone', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'accountNumber', label: 'Número de cuenta', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'typeAccount', label: 'Tipo de cuenta', type: 'select', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'paymentCurrency', label: 'Moneda de pago', type: 'select', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'agreedPaymentTerm', label: 'Plazo de Pago pactado', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'paymentMethod', label: 'Método de pago', type: 'select', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'emailElectronicBillingPayments', label: 'E-mail Facturación electrónica/Pagos', type: 'email', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'WhichMetodWire', label: '¿Cuales?', type: 'text', seccion: '5. INFORMACIÓN BANCARIA', visible: true, columnSpan: 1 },
        { key: 'texto_info_seccion6', label: '', type: 'docs-info', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 3, ordenFijo: 45.5 },
        { key: 'typeManagementSystem', label: 'Tipo de sistema de gestión', type: 'select', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 1 },
        { key: 'document1', label: 'Documento sistema de gestión', type: 'text', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 2, required: false, grupoDocumento: 1 },
        { key: 'document_ambiental', label: 'Certificación ISO 14001 o Sostenibilidad', type: 'text', seccion: '6. DOCUMENTACIÓN REQUERIDA', visible: true, columnSpan: 3 },
        { key: 'applicationState', label: 'Estado de la solicitud', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 1, required: this.esUsuarioInterno(), ordenFijo: 90.1 },
        { key: 'requestedBy', label: 'Solicitado por', type: 'text', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 1, required: this.esUsuarioInterno(), ordenFijo: 90.2 },
        { key: 'managementWhichItBelongs', label: 'Gerencia a la que pertenece', type: 'text', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 1, required: this.esUsuarioInterno(), ordenFijo: 90.3 },
        { key: 'ApplicantPosition', label: 'Cargo del solicitante', type: 'text', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 1, required: this.esUsuarioInterno(), ordenFijo: 90.4 },
        { key: 'supplierType', label: 'Tipo de proveedor', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 2, required: this.esUsuarioInterno(), ordenFijo: 90.5 },
        { key: 'supplierClassification', label: 'Clasificación del proveedor', type: 'select', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 2, required: this.esUsuarioInterno(), ordenFijo: 90.6 },
        { key: 'date', label: 'Fecha', type: 'date', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 1, required: this.esUsuarioInterno(), ordenFijo: 90.7 },
        { key: 'isCounterpartySelect', label: '¿El proveedor es seleccionado por la contraparte?', type: 'textarea', seccion: '8. ESPACIO EXCLUSIVO PARA NUVANT', visible: this.esUsuarioInterno(), columnSpan: 3, ordenFijo: 90.8 },
      ];

      // Fusión campos API + manuales
      camposManuales.forEach((campoManual) => {
        const key = campoManual.key!;
        const indexAPI = nuevoCamposDinamicos.findIndex(
          (c) => c.key === key || c.label.toLowerCase().trim() === campoManual.label?.toLowerCase().trim()
        );

        let valorDeIA = '';
        let opcionesDelBackend = campoManual.options ?? [];
        let ordenDefinitivo = campoManual.ordenFijo ?? 9999;
        let idFromApi = '';
        let writableFromApi = false;


        if (indexAPI !== -1) {
          const campoAPI = nuevoCamposDinamicos[indexAPI];
          valorDeIA = controlesReactivos[campoAPI.key]?.[0] ?? '';
          idFromApi = campoAPI.idValueField ?? '';
          writableFromApi = campoAPI.isWritable ?? false;
          if (campoAPI.options?.length) opcionesDelBackend = campoAPI.options;
          if (campoAPI.orderToGetValue !== undefined && campoAPI.orderToGetValue !== 9999) {
            ordenDefinitivo = campoAPI.orderToGetValue;
          }
          delete controlesReactivos[campoAPI.key];
          nuevoCamposDinamicos.splice(indexAPI, 1);
        }

        controlesReactivos[key] = [valorDeIA, campoManual.required ? Validators.required : null];

        nuevoCamposDinamicos.push({
          key,
          label: campoManual.label ?? '',
          type: campoManual.type ?? 'text',
          options: opcionesDelBackend,
          isLong: false,
          columnSpan: campoManual.columnSpan ?? 1,
          autocompletado: false,
          visible: campoManual.visible ?? true,
          grupoBeneficiario: 0,
          grupoDocumento: campoManual.grupoDocumento ?? 0,
          seccion: campoManual.seccion ?? '',
          orderToGetValue: ordenDefinitivo,
          ordenFijo: campoManual.ordenFijo,
          idValueField: idFromApi || undefined,
          isWritable: writableFromApi || false,
        });
      });

      // Orden final
      nuevoCamposDinamicos.sort((a, b) => (a.orderToGetValue ?? 9999) - (b.orderToGetValue ?? 9999));

      this.camposDinamicos.set(nuevoCamposDinamicos);
      this.seccionesDisponibles.set([...new Set(nuevoCamposDinamicos.map((c) => c.seccion))]);
      this.seccionActualIndex.set(0);
      this.form.setControl('formDinamico', this.fb.group(controlesReactivos));

      // 🔠 MAYÚSCULAS GLOBALES: cualquier cambio en el formDinamico se convierte a mayúscula
     const formDinamico = this.form.get('formDinamico') as any;
      if (formDinamico) {
        Object.keys(formDinamico.controls).forEach((key: string) => {
          const ctrl = formDinamico.get(key);
          if (!ctrl) return;

          // 1. Identificamos qué tipo de campo es
          const campoEncontrado = this.camposDinamicos().find(c => c.key === key);

          ctrl.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((val: any) => {
              if (typeof val === 'string' && val !== val.toUpperCase()) {
                // 2. Solo aplicamos mayúsculas si NO es un select y NO es un email
                if (campoEncontrado?.type !== 'select' && campoEncontrado?.type !== 'email') {
                  ctrl.setValue(val.toUpperCase(), { emitEvent: false });
                }
              }
            });
        });

        // ✅ Renombrar document1 cuando el usuario cambia typeManagementSystem
        // Caso: adjunta el archivo primero, luego elige el tipo de sistema de gestión
        const selectDoc1 = formDinamico.get('typeManagementSystem');
        if (selectDoc1) {
          selectDoc1.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((nuevoTipo: string) => {
              const ext = this.extensionesArchivos['document1'];
              if (!nuevoTipo?.trim() || !ext) return;
              const nuevoNombre = `${nuevoTipo.trim()}.${ext}`;
              const ctrlDoc = formDinamico.get('document1');
              if (ctrlDoc) {
                ctrlDoc.setValue(nuevoNombre, { emitEvent: false });
              }
            });
        }
      }

      setTimeout(() => {
        this.overlayOpen.set(false);
        this.currentStep.set(2);
      }, 500);

    } catch (error) {
      console.error('Error crítico mapeando el JSON:', error);
      this.overlayOpen.set(false);
      Swal.fire({
        title: 'Error de Lectura',
        text: 'Ocurrió un problema al organizar los datos del documento. Intenta subirlo nuevamente.',
        icon: 'warning',
        confirmButtonColor: 'var(--accent)',
        background: 'var(--surface)',
        color: 'var(--text)',
      });
    }
  }

  validarVigenciaRut(textoFecha: string): boolean {
    const match = textoFecha.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!match) return false;

    const fechaRUT = new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10));
    const diasPasados = Math.floor((Date.now() - fechaRUT.getTime()) / 86_400_000);
    console.log(`📅 RUT generado hace ${diasPasados} días.`);
    return diasPasados <= 30;
  }

  // ─────────────────────────────────────────────
  // Dirección DIAN
  // ─────────────────────────────────────────────

  esCampoDireccion(label: string): boolean {
    const lbl = String(label).toLowerCase();
    return lbl.includes('dirección') || lbl.includes('direccion');
  }

  abrirModalDireccion(key: string): void {
    this.campoDireccionActivo.set(key);
    this.direccionesTokens.set([]);
    this.modalDireccionAbierto.set(true);
  }

  cerrarModalDireccion(): void {
    this.modalDireccionAbierto.set(false);
    this.campoDireccionActivo.set('');
  }

  confirmarDireccion(): void {
    const control = this.form.get('formDinamico')?.get(this.campoDireccionActivo());
    if (control) {
      control.setValue(this.direccionActual());
      control.markAsDirty();
      control.markAsTouched();
      control.updateValueAndValidity();
    }
    this.cerrarModalDireccion();
  }

  limpiarTokens(): void { this.direccionesTokens.set([]); }

  eliminarToken(index: number): void {
    this.direccionesTokens.update((tokens) => tokens.filter((_, i) => i !== index));
  }

  private sanitizeDIAN(raw: string, mode: 'strict' | 'token' | 'numeric' = 'strict'): string {
    const noAcc = (raw ?? '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (mode === 'numeric') return noAcc.replace(/[^0-9]+/g, '').trim();
    const disallowed = mode === 'token' ? /[^A-Z0-9Ñ #\-]+/g : /[^A-Z0-9Ñ ]+/g;
    return noAcc.replace(disallowed, ' ').replace(/\s+/g, ' ').trim();
  }

  private agregarToken(kind: string, parts: string[]): void {
    const clean = parts.map((p) => this.sanitizeDIAN(p, 'strict')).filter(Boolean);
    if (clean.length) {
      this.direccionesTokens.update((t) => [...t, { kind, text: clean.join(' ') }]);
    }
  }

  addDianInicial(): void {
    const num = this.sanitizeDIAN(this.dianData.numInicial, 'numeric');
    const nombre = this.sanitizeDIAN(this.dianData.nombreViaInicial, 'strict');

    if ((num && nombre) || (!num && !nombre)) {
      Swal.fire({ icon: 'warning', title: 'Faltan datos', text: 'Debes diligenciar SOLO uno: "Número" o "Nombre de la vía" (no ambos).', confirmButtonColor: 'var(--accent)' });
      return;
    }

    const core = num || nombre;
    const parts = num
      ? [this.dianData.viaInicial, core, this.dianData.letraInicial, this.dianData.bisInicial, this.dianData.cuadInicial]
      : [this.dianData.viaInicial, core, this.dianData.bisInicial, this.dianData.cuadInicial];

    this.agregarToken('INI', parts);
    Object.assign(this.dianData, { numInicial: '', nombreViaInicial: '', letraInicial: '', bisInicial: '', cuadInicial: '' });
  }

  addDianPlaca(): void {
    if (!this.dianData.placa1 || !this.dianData.placa2) {
      Swal.fire({ icon: 'warning', title: 'Faltan datos', text: 'Ingresa Parte 1 y Parte 2 de la placa.', confirmButtonColor: 'var(--accent)' });
      return;
    }
    this.agregarToken('PLACA', [this.dianData.placa1, this.dianData.placaLetra, this.dianData.placaBis, this.dianData.placaCuad, this.dianData.placa2]);
    Object.assign(this.dianData, { placa1: '', placa2: '', placaLetra: '', placaBis: '', placaCuad: '' });
  }

  addDianFinal(): void {
    if (!this.dianData.finalValor) return;
    this.agregarToken('FIN', [this.dianData.finalTipo, this.dianData.finalValor]);
    this.dianData.finalValor = '';
  }

  addDianToken(token: string): void {
    this.direccionesTokens.update((t) => [...t, { kind: 'TOK', text: token }]);
  }

  addDianComplemento(): void {
    const c = this.sanitizeDIAN(this.dianData.complemento, 'strict');
    if (c) this.agregarToken('COMP', [c]);
    this.dianData.complemento = '';
  }

  // ─────────────────────────────────────────────
  // Envío del formulario
  // ─────────────────────────────────────────────
submitForm(): void {
  this.overlayOpen.set(true);
  this.overlayTitle.set('Enviando información...');
  this.overlaySubtitle.set('Guardando datos del proveedor...');

  const idServiceOrder = this.osParam();
  const formValues: Record<string, any> = this.form.get('formDinamico')?.value ?? {};
  const todosLosCampos: CampoDinamico[] = this.camposDinamicos();

  const dataFields = todosLosCampos
    .filter(c => {
      const tieneIdValido = c.idValueField && typeof c.idValueField === 'string' && c.idValueField.length > 30;
      const noEsSubCampo = c.type !== 'hidden-phone-sub';
      return tieneIdValido && noEsSubCampo;
    })

    .map(c => {
      const rawValue = formValues[c.key] ?? '';
      const labelLimpio = c.key;
      const phoneInputKey = this.getPhoneInputKey(c.key);
      const phoneValue = c.type === 'phone' && phoneInputKey !== c.key
        ? (this.indicativoSeleccionado()[c.key] ?? '') + (formValues[phoneInputKey] ?? '')
        : null;

      const extKey = this.getExtKey(c.key);
      const extValue = extKey ? (formValues[extKey] ?? '') : null;

      let valorFinal: string;
      if (phoneValue !== null) {
        valorFinal = extValue ? `${phoneValue} Ext. ${extValue}` : phoneValue;
      } else {
        valorFinal = String(rawValue ?? '');
      }

      return {
        idValueField: c.idValueField!,
        labelIdField: labelLimpio,
        valueField: valorFinal,
      };
    });

  if (dataFields.length === 0) {
    this.overlayOpen.set(false);
    Swal.fire({
      icon: 'warning',
      title: 'Sin datos válidos',
      text: 'No se encontraron campos válidos para guardar.',
      confirmButtonColor: 'var(--accent)'
    });
    return;
  }

  this.services.saveProviderData({ idServiceOrder, dataFields })
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: () => {
        this.overlayTitle.set('Subiendo documentos...');
        this.overlaySubtitle.set('Preparando archivos...');

        const archivosParaSubir: { file: File, nombre: string }[] = [];

        // 📁 A. Archivos del PASO 1 (RUT, Cámara, Bancaria...)
        const docsPaso1 = this.form.get('step2_docs')?.value || {};
        for (const key in docsPaso1) {
          if (docsPaso1[key] instanceof File) {
            const f = docsPaso1[key] as File;
            // ✅ FIX: usar el título descriptivo del documento (ej: "RUT Actualizado.pdf")
            // en vez del nombre real del archivo del sistema operativo
            const configDoc = this.arrayItems().find(d => d.key === key);
            const ext = f.name.split('.').pop() ?? '';
            const nombreFinal = configDoc
              ? `${configDoc.title}.${ext}`
              : f.name;
            archivosParaSubir.push({ file: f, nombre: nombreFinal });
          }
        }

        // 📁 B. Archivos dinámicos (document1, document2, document_ambiental...)
        // ✅ FIX: usar el nombre renombrado guardado en formDinamico (ej: "ISO 9001.pdf")
        // en vez de f.name que es el nombre real del archivo en el sistema operativo
        const archivosDinamicos = this.archivosAdjuntosDinamicos();
        const formDinValues = this.form.get('formDinamico')?.value ?? {};
        for (const key in archivosDinamicos) {
          const f = archivosDinamicos[key];
          // formDinamico guarda el nombre renombrado como string (ej: "ISO 9001.pdf")
          const nombreRenombrado = formDinValues[key];
          const nombreFinal = (typeof nombreRenombrado === 'string' && nombreRenombrado.trim())
            ? nombreRenombrado.trim()
            : f.name;
          archivosParaSubir.push({ file: f, nombre: nombreFinal });
        }

        if (archivosParaSubir.length === 0) {
          this.finalizarProcesoConExito();
          return;
        }

        from(archivosParaSubir).pipe(
          concatMap(data => {
            this.overlaySubtitle.set(`Subiendo: ${data.nombre}...`);
            return this.services.uploadProviderFile(data.file, idServiceOrder, data.nombre).pipe(
              catchError(err => {
                console.error(`❌ Error subiendo ${data.nombre}:`, err);
                return of(null);
              })
            );
          }),
          toArray()
        ).subscribe(() => {
          this.finalizarProcesoConExito();
        });
      },
      error: (err) => {
        this.overlayOpen.set(false);
        console.error('❌ Error al guardar en DB:', err);
        Swal.fire({
          title: 'Error al guardar',
          text: 'Ocurrió un error de conexión con la base de datos.',
          icon: 'error',
          confirmButtonColor: '#ef4444'
        });
      }
    });
}
  finalizarProcesoConExito(): void {
    this.overlayOpen.set(false);
    Swal.fire({
      title: '¡Registro Exitoso!',
      text: 'Los datos y documentos fueron guardados correctamente.',
      icon: 'success',
      confirmButtonColor: '#3b82f6',
      color: 'var(--text)',
    });
  }


  // ─────────────────────────────────────────────
  // Overlay
  // ─────────────────────────────────────────────

  onOverlayClose(): void { this.overlayOpen.set(false); }

  // ─────────────────────────────────────────────
  // Toast
  // ─────────────────────────────────────────────

  mostrarToast(mensaje: string): void {
    this.toastMessage.set(mensaje);
    setTimeout(() => this.toastMessage.set(null), 3000);
  }

  // ─────────────────────────────────────────────
  // Validators
  // ─────────────────────────────────────────────

  atLeastOneFileValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const group = control as FormGroup;
      const hasFile = Object.values(group.controls).some((c) => c.value instanceof File);
      return hasFile ? null : { noFiles: true };
    };
  }

  // ─────────────────────────────────────────────
  // Helpers privados
  // ─────────────────────────────────────────────

  private mostrarLimiteAlcanzado(text: string): void {
    Swal.fire({
      icon: 'warning',
      title: 'Límite alcanzado',
      text,
      confirmButtonText: 'Entendido',
      confirmButtonColor: 'var(--accent)',
      background: 'var(--surface)',
      color: 'var(--text)',
    });
  }

getArchivosPaso1(): { label: string, nombre: string }[] {
    const docs = this.form.get('step2_docs')?.value || {};
    const archivos = [];
    for (const key in docs) {
      if (docs[key] instanceof File) {
        const docConfig = this.arrayItems().find(d => d.key === key);
        const label = docConfig?.title ?? key.replace(/_/g, ' ').toUpperCase();
        archivos.push({ label, nombre: docs[key].name });
      }
    }
    return archivos;
  }

  // Verifica si el valor de un campo dinámico es texto normal o un archivo
  getValorMostrado(campo: any): string {
    const valor = this.form.get('formDinamico')?.get(campo.key)?.value;

    // Si es un documento adjunto directo (File en el control)
    if (valor instanceof File) {
      return '📄 ' + valor.name;
    }

    // ✅ FIX: para documentos adicionales el File real está en archivosAdjuntosDinamicos
    // (formDinamico solo guarda el nombre como string para estos campos)
    const archivoReal = this.archivosAdjuntosDinamicos()[campo.key];
    if (archivoReal instanceof File) {
      return '📄 ' + archivoReal.name;
    }

    // Si el control tiene un string con nombre de archivo (ej: "ISO 9001.PDF")
    if (typeof valor === 'string' && valor.trim() !== '' &&
        (valor.toLowerCase().includes('.pdf') || valor.toLowerCase().includes('.png') ||
         valor.toLowerCase().includes('.jpg') || valor.toLowerCase().includes('.jpeg') ||
         valor.toLowerCase().includes('.doc') || valor.toLowerCase().includes('.docx'))) {
      return '📄 ' + valor;
    }

    // Si el usuario lo dejó vacío
    if (valor === null || valor === undefined || valor === '') {
      return 'N/A';
    }

    // Si es texto o número normal
    return String(valor);
  }

  // Retorna los documentos dinámicos agrupados (document1, agrupado_2, agrupado_3...)
  // para mostrarlos en la sección de revisión del paso 3
  getDocumentosDinamicosParaRevision(): { tipoLabel: string; tipoValor: string; archivoLabel: string; archivoNombre: string }[] {
    const resultado: { tipoLabel: string; tipoValor: string; archivoLabel: string; archivoNombre: string }[] = [];
    const campos = this.camposDinamicos();
    const formDin = this.form.get('formDinamico');
    const archivos = this.archivosAdjuntosDinamicos();

    // Documento 1 (campo simple: typeManagementSystem + document1)
    const doc1 = campos.find(c => c.key === 'document1' && c.visible !== false);
    if (doc1) {
      const tipoCtrl = formDin?.get('typeManagementSystem');
      const tipoValor = tipoCtrl?.value ?? '';
      const archivoFile = archivos['document1'];
      const archivoNombre = archivoFile ? archivoFile.name : (formDin?.get('document1')?.value ?? '');
      if (archivoNombre) {
        resultado.push({
          tipoLabel: 'Tipo de sistema de gestión',
          tipoValor,
          archivoLabel: doc1.label,
          archivoNombre,
        });
      }
    }

    // Documentos adicionales (agrupado_2, agrupado_3... tipo documento-agrupado)
    campos
      .filter(c => c.type === 'documento-agrupado' && c.visible !== false)
      .forEach(c => {
        const selectKey = c.selectConfig?.key;
        const fileKey = c.fileConfig?.key;
        const tipoValor = selectKey ? (formDin?.get(selectKey)?.value ?? '') : '';
        const archivoFile = fileKey ? archivos[fileKey] : undefined;
        const archivoNombre = archivoFile
          ? archivoFile.name
          : (fileKey ? (formDin?.get(fileKey)?.value ?? '') : '');
        if (archivoNombre) {
          resultado.push({
            tipoLabel: c.selectConfig?.label ?? 'Tipo de sistema',
            tipoValor,
            archivoLabel: c.fileConfig?.label ?? c.tituloInterno ?? 'Documento',
            archivoNombre,
          });
        }
      });

    // Documento ambiental (document_ambiental)
    const docAmb = campos.find(c => c.key === 'document_ambiental' && c.visible !== false);
    if (docAmb) {
      const archivoFile = archivos['document_ambiental'];
      const archivoNombre = archivoFile ? archivoFile.name : (formDin?.get('document_ambiental')?.value ?? '');
      if (archivoNombre) {
        resultado.push({
          tipoLabel: '',
          tipoValor: '',
          archivoLabel: docAmb.label,
          archivoNombre,
        });
      }
    }

    // Firma y sello
    const archivoFirma = archivos['document_firma_sello'];
    const firmaStr = formDin?.get('document_firma_sello')?.value ?? '';
    const firmaNombre = archivoFirma ? archivoFirma.name : firmaStr;
    if (firmaNombre) {
      resultado.push({
        tipoLabel: '',
        tipoValor: '',
        archivoLabel: 'Firma y Sello',
        archivoNombre: firmaNombre,
      });
    }

    return resultado;
  }
  getCamposConValorPorSeccion(seccion: string): CampoDinamico[] {
  return this.camposDinamicos().filter(c => {
    if (c.seccion !== seccion) return false;
    if (c.visible === false) return false;
    if (c.type === 'hidden-phone-sub') return false;
    if (c.type === 'documento-agrupado') return false;
    if (c.type === 'legal-text') return false;
    if (c.type === 'bloque-firmas') return false;
    if (c.type.includes('info')) return false;
    if (!c.label?.trim()) return false;
    const valor = this.getValorMostrado(c);
    return valor !== 'N/A' && valor.trim() !== '';
  });
}
}
