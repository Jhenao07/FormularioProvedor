import { CommonModule } from '@angular/common';
import { Component, forwardRef, Input } from '@angular/core';
import { NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-dynamic-field',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dynamic-field.component.html',
  styleUrl: './dynamic-field.component.css',
  providers: [
    {
   provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DynamicFieldComponent),
      multi: true

    }
  ]
})
export class DynamicFieldComponent {
  @Input() config: any;

  // Variables internas para manejar el valor
  value: any = '';
  onChange: any = () => {};
  onTouched: any = () => {};

  // 🟢 2. MÉTODOS OBLIGATORIOS DE CONTROL VALUE ACCESSOR

  // Angular llama a esto para escribir el valor inicial (ej. cuando la IA extrae el dato)
  writeValue(val: any): void {
    if (val !== undefined) {
      this.value = val;
    }
  }

  // Angular nos pasa la función para avisarle cuando el usuario cambia algo
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  // Angular nos pasa la función para avisarle cuando el usuario tocó el campo (focus/blur)
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  // 🟢 3. NUESTRO MÉTODO PARA CAPTURAR LO QUE EL USUARIO HACE
  onInput(event: any) {
    this.value = event.target.value;
    this.onChange(this.value); // Le avisamos al FormGroup principal
    this.onTouched();          // Le avisamos que ya fue tocado
  }
}
