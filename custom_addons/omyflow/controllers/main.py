# -*- coding: utf-8 -*-

from odoo import http
from odoo.http import request


class OMyFlowController(http.Controller):
    @http.route('/omyflow', type='http', auth='user')
    def index(self, **kwargs):
        return request.render('omyflow.omyflow_index')
