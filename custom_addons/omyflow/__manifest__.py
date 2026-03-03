# -*- coding: utf-8 -*-

{
    'name': 'OMyFlow',
    'category': 'Tools',
    'version': '1.0.0',
    'description': """
OMyFlow - Custom Flow Module
============================

A multi-page custom flow system with:
- Page grouping management
- Multiple layout modes
- Form inline editing
- Settings panel
- Theme system
- Model-based page routing
    """,
    'depends': ['web'],
    'data': [
        'views/omyflow_templates.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
