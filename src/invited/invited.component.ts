import { Component } from '@angular/core';
import { services } from '../app/services';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-invited',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invited.components.html',
  styleUrls: ['./invited.css'],
})
export class InvitedComponent {

  data: any = null;

  constructor(private dataService: services, private router: Router) {}

  ngOnInit() {
    this.data = this.dataService.getData();
    console.log('Datos recibidos:', this.data);
  }

  goInbox() {
    this.router.navigate(['/register-provider']);
  }
 }
