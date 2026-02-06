import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

@Component({
  selector: 'app-progress-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './progressOverlay.component.html',
  styleUrls: ['./progressOverlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressOverlayComponent {
  @Input({ required: true }) open = false;
  @Input() title = 'Procesando...';

  @Input() subtitle: string | null = null;

  @Input() current = 0;
  @Input() total = 0;
  @Input() indeterminate = false;
  @Input() accent = '#ff6647'; // color principal
  @Input() trackOpacity = 0.18; // transparencia del track
  @Input() backdropOpacity = 0.55; // oscuridad del fondo
  @Input() blurPx = 10; // blur del backdrop
  @Input() width = 'min(560px, 92vw)'; // ancho card
  @Input() barHeight = 10; // alto barra
  @Input() radius = 16; // border radius card
  @Input() elevation = true; // sombra

  @Input() closable = false;
  @Output() close = new EventEmitter<void>();

  get percent(): number {
    if (this.indeterminate) return 0;
    if (!this.total) return 0;
    const p = (this.current / this.total) * 100;
    return Math.max(0, Math.min(100, Math.round(p)));
  }

  get showNumbers(): boolean {
    return !this.indeterminate && this.total > 0;
  }

  onClose() {
    this.close.emit();
  }
}
