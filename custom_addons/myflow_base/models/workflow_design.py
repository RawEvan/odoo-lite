# -*- coding: utf-8 -*-

from odoo import api, fields, models


class WorkflowDesign(models.Model):
    _name = "cr.workflow.design"
    _description = "Workflow Design"
    _order = "sequence, id"

    name = fields.Char(string="Name", required=True)
    key = fields.Char(string="Key", required=True, index=True)
    description = fields.Text(string="Description")
    layout = fields.Text(string="Layout")
    sequence = fields.Integer(string="Sequence", default=10)
    active = fields.Boolean(string="Active", default=True)

    @api.model
    def _get_default_layout_fallback(self):
        """
        When stored ``layout`` is empty or invalid, the API uses this map per workflow ``key``.
        Other addons inherit and extend (do not hardcode plugin keys in ``myflow_base``).
        """
        return {
            "workflow-design": {
                "left": {
                    "width": "260px",
                    "components": [{"key": "workflow-list", "size": "full"}],
                },
                "middle": {
                    "components": [{"key": "workflow-editor", "size": "full"}],
                },
                "right": {
                    "width": "320px",
                    "components": [{"key": "workflow-customization", "size": "full"}],
                },
            },
            "add-workflow": {
                "middle": {
                    "components": [{"key": "workflow-add-builder", "size": "full"}],
                },
            },
        }

