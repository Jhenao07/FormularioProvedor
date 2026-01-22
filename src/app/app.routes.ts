
import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import {  InvitedComponent } from '../invited/invited.component';


export const routes: Routes = [
  {
    path: '',
    component: AppComponent
  },
  {
    path: 'invited',
    component: InvitedComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
